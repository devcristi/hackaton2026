/**
 * NeoTwin ESP32 Firmware
 * Sensors: DHT22, BMP280, MQ-135, LDR, HC-SR04, MPU6050, ACS712, SG90
 * Sends JSON via HTTP POST to FastAPI /ingest every 1s
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Adafruit_BMP280.h>
#include <MPU6050.h>
#include <ESP32Servo.h>
#include <time.h>

// ─── WiFi & API Config ────────────────────────────────────────────────────────
#ifndef WIFI_SSID
  #define WIFI_SSID     "YourSSID"
#endif
#ifndef WIFI_PASSWORD
  #define WIFI_PASSWORD "YourPassword"
#endif
#ifndef API_HOST
  #define API_HOST      "192.168.1.100"
#endif
#ifndef API_PORT
  #define API_PORT      8000
#endif

const char* INGEST_URL = "http://" API_HOST ":" + String(API_PORT) + "/ingest";

// ─── Pin Definitions ──────────────────────────────────────────────────────────
#define DHT_PIN        4
#define DHT_TYPE       DHT22

#define MQ135_PIN      34   // ADC1_CH6  – air quality (analog)
#define LDR_PIN        35   // ADC1_CH7  – light (analog)
#define ACS712_PIN     32   // ADC1_CH4  – current (analog)

#define TRIG_PIN       25   // HC-SR04 trigger
#define ECHO_PIN       26   // HC-SR04 echo

#define SERVO_PIN      27   // SG90 signal

// BMP280 + MPU6050 share I2C: SDA=21, SCL=22 (default ESP32)
// BMP280 addr: 0x76 | MPU6050 addr: 0x68

// ─── Hardware Objects ─────────────────────────────────────────────────────────
DHT           dht(DHT_PIN, DHT_TYPE);
Adafruit_BMP280 bmp;
MPU6050       mpu;
Servo         ventServo;

// ─── ACS712 Calibration (run once at boot) ────────────────────────────────────
float acs712OffsetV = 1.65f;  // midpoint ~VCC/2 at 0A; calibrated at boot
const float ACS712_SENSITIVITY = 0.185f; // 5A module: 185mV/A

// ─── Timing ──────────────────────────────────────────────────────────────────
unsigned long lastPost = 0;
const unsigned long POST_INTERVAL_MS = 1000;

// ─── Servo state ─────────────────────────────────────────────────────────────
int servoAngle = 0;  // controlled by backend command (via polling /command)

// ─────────────────────────────────────────────────────────────────────────────
// Sensor Reads
// ─────────────────────────────────────────────────────────────────────────────

float readAirTempC() {
  float t = dht.readTemperature();
  return isnan(t) ? -999.0f : t;
}

float readHumidityPct() {
  float h = dht.readHumidity();
  return isnan(h) ? -999.0f : h;
}

struct BmpData { float pressureHpa; float altitudeM; float tempC; };
BmpData readBmp() {
  BmpData d;
  d.pressureHpa = bmp.readPressure() / 100.0f;
  d.altitudeM   = bmp.readAltitude(1013.25f);
  d.tempC       = bmp.readTemperature();
  return d;
}

/** MQ-135: returns raw ADC (0–4095) → ppm approx via simple linear map.
 *  For hackathon purposes we return raw + voltage; proper Rs/R0 calibration
 *  can be done post-demo.
 */
float readAirQualityRaw() {
  return (float)analogRead(MQ135_PIN);
}

float readLdrRaw() {
  return (float)analogRead(LDR_PIN);
}

/** Convert LDR ADC value to approximate lux (inverse log relation) */
float ldrToLux(float raw) {
  // 0 → bright (0 lux mapped), 4095 → dark
  if (raw <= 0) return 10000.0f;
  float voltage = raw * 3.3f / 4095.0f;
  float resistance = (3.3f - voltage) / voltage * 10000.0f; // 10kΩ pull-down
  return 500000.0f / resistance; // empirical constant
}

/** HC-SR04: returns distance in cm */
float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout
  if (duration == 0) return 999.0f; // no echo = open space
  return duration * 0.034f / 2.0f;
}

struct MpuData {
  float accelX, accelY, accelZ;   // g
  float gyroX,  gyroY,  gyroZ;   // °/s
  float tempC;
};
MpuData readMpu() {
  MpuData d;
  int16_t ax, ay, az, gx, gy, gz;
  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
  d.accelX = ax / 16384.0f;
  d.accelY = ay / 16384.0f;
  d.accelZ = az / 16384.0f;
  d.gyroX  = gx / 131.0f;
  d.gyroY  = gy / 131.0f;
  d.gyroZ  = gz / 131.0f;
  d.tempC  = mpu.getTemperature() / 340.0f + 36.53f;
  return d;
}

/** ACS712: returns current in Amperes */
float readCurrentA() {
  const int SAMPLES = 50;
  float sum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    float v = analogRead(ACS712_PIN) * 3.3f / 4095.0f;
    sum += v;
    delayMicroseconds(200);
  }
  float meanV = sum / SAMPLES;
  return (meanV - acs712OffsetV) / ACS712_SENSITIVITY;
}

/** Calibrate ACS712 offset at boot (no load) */
void calibrateAcs712() {
  const int SAMPLES = 200;
  float sum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    sum += analogRead(ACS712_PIN) * 3.3f / 4095.0f;
    delay(1);
  }
  acs712OffsetV = sum / SAMPLES;
  Serial.printf("[ACS712] Calibrated offset: %.4f V\n", acs712OffsetV);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

void postSensorData(JsonDocument& doc) {
  HTTPClient http;
  char url[80];
  snprintf(url, sizeof(url), "http://%s:%d/ingest", API_HOST, API_PORT);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code == 200) {
    // Parse servo command from response
    String resp = http.getString();
    JsonDocument respDoc;
    if (!deserializeJson(respDoc, resp)) {
      if (respDoc["servoAngleDeg"].is<int>()) {
        int angle = respDoc["servoAngleDeg"].as<int>();
        angle = constrain(angle, 0, 180);
        if (angle != servoAngle) {
          servoAngle = angle;
          ventServo.write(servoAngle);
          Serial.printf("[Servo] → %d°\n", servoAngle);
        }
      }
    }
  } else {
    Serial.printf("[HTTP] POST failed: %d\n", code);
  }
  http.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n[NeoTwin] Booting...");

  // DHT22
  dht.begin();

  // BMP280
  if (!bmp.begin(0x76)) {
    Serial.println("[BMP280] Not found at 0x76, trying 0x77");
    if (!bmp.begin(0x77)) {
      Serial.println("[BMP280] FAILED – check wiring");
    }
  }
  bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                  Adafruit_BMP280::SAMPLING_X2,
                  Adafruit_BMP280::SAMPLING_X16,
                  Adafruit_BMP280::FILTER_X16,
                  Adafruit_BMP280::STANDBY_MS_500);

  // MPU6050
  Wire.begin();
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("[MPU6050] Connection FAILED");
  }

  // Pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  analogReadResolution(12);  // 12-bit ADC on ESP32

  // Servo
  ESP32PWM::allocateTimer(0);
  ventServo.setPeriodHertz(50);
  ventServo.attach(SERVO_PIN, 500, 2400);
  ventServo.write(0);  // closed position

  // ACS712 calibration (no load)
  Serial.println("[ACS712] Calibrating (remove load)...");
  delay(2000);
  calibrateAcs712();

  // WiFi
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Connected → %s\n", WiFi.localIP().toString().c_str());

  // NTP sync
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("[NTP] Syncing");
  struct tm ti;
  while (!getLocalTime(&ti)) { delay(500); Serial.print("."); }
  Serial.println(" OK");

  Serial.println("[NeoTwin] Ready ✓");
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop
// ─────────────────────────────────────────────────────────────────────────────

void loop() {
  unsigned long now = millis();
  if (now - lastPost < POST_INTERVAL_MS) return;
  lastPost = now;

  // ── Read all sensors ──────────────────────────────────────────────────────
  float airTemp    = readAirTempC();
  float humidity   = readHumidityPct();
  BmpData bmpData  = readBmp();
  float aqRaw      = readAirQualityRaw();
  float ldrRaw     = readLdrRaw();
  float lux        = ldrToLux(ldrRaw);
  float distanceCm = readDistanceCm();
  MpuData mpuData  = readMpu();
  float currentA   = readCurrentA();

  // UNIX timestamp from NTP
  struct tm ti;
  time_t ts = 0;
  if (getLocalTime(&ti)) ts = mktime(&ti);

  // ── Build JSON payload ────────────────────────────────────────────────────
  JsonDocument doc;
  doc["ts"]              = (long long)ts;

  // DHT22
  doc["airTempC"]        = isnan(airTemp)  ? nullptr : serialized(String(airTemp, 2));
  doc["humidityPct"]     = isnan(humidity) ? nullptr : serialized(String(humidity, 2));

  // BMP280
  doc["pressureHpa"]     = serialized(String(bmpData.pressureHpa, 2));
  doc["altitudeM"]       = serialized(String(bmpData.altitudeM, 2));
  doc["bmpTempC"]        = serialized(String(bmpData.tempC, 2));

  // MQ-135
  doc["airQualityRaw"]   = (int)aqRaw;
  doc["airQualityPpm"]   = serialized(String(aqRaw * 500.0f / 4095.0f, 1)); // rough linear

  // LDR
  doc["lightRaw"]        = (int)ldrRaw;
  doc["lightLux"]        = serialized(String(lux, 1));

  // HC-SR04
  doc["lidDistanceCm"]   = serialized(String(distanceCm, 1));
  doc["lidOpen"]         = distanceCm > 5.0f;

  // MPU6050
  doc["accelX"]          = serialized(String(mpuData.accelX, 4));
  doc["accelY"]          = serialized(String(mpuData.accelY, 4));
  doc["accelZ"]          = serialized(String(mpuData.accelZ, 4));
  doc["gyroX"]           = serialized(String(mpuData.gyroX, 2));
  doc["gyroY"]           = serialized(String(mpuData.gyroY, 2));
  doc["gyroZ"]           = serialized(String(mpuData.gyroZ, 2));
  doc["mpuTempC"]        = serialized(String(mpuData.tempC, 2));

  // ACS712
  doc["heaterCurrentA"]  = serialized(String(currentA, 4));
  doc["heaterActive"]    = currentA > 0.1f;

  // Servo (current position)
  doc["servoAngleDeg"]   = servoAngle;

  // Debug serial
  Serial.printf("[%lld] T=%.1f°C H=%.1f%% P=%.1fhPa d=%.1fcm I=%.3fA Q=%d lux=%.0f\n",
    (long long)ts, airTemp, humidity, bmpData.pressureHpa,
    distanceCm, currentA, (int)aqRaw, lux);

  // ── POST ──────────────────────────────────────────────────────────────────
  if (WiFi.status() == WL_CONNECTED) {
    postSensorData(doc);
  } else {
    Serial.println("[WiFi] Disconnected – reconnecting...");
    WiFi.reconnect();
  }
}
