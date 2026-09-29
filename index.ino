/********* 
By: Carlos Giovani Dutra 
Projeto: SMART WEATHER 
*********/ 
#include <WiFi.h>  
#include <WiFiClient.h> 
#include <PubSubClient.h>  
#include <Wire.h>  
#include <LiquidCrystal_I2C.h>  
#include <DHT.h> 
#define DHT_TYPE DHT22 
#define DHT_PIN 4 
DHT dht(DHT_PIN, DHT_TYPE); 
LiquidCrystal_I2C lcd(0x27, 16, 2); 
const char* ssid = "Wokwi-GUEST"; 
const char* password = ""; 
const char* hostname = "broker.hivemq.com";  
const char* espClientName = "bubols_client";  
int PORTNUM = 1883; 
// --- Tópicos MQTT --- 
// NOVO: Tópicos para PUBLICAR os dados dos sensores 
const char* tempTopic = "bubols/temp"; 
const char* humidityTopic = "bubols/hum"; 
// Tópicos para RECEBER comandos (subscribes) 
const char* acTopic = "bubols/S1"; 
const char* humidifierTopic = "bubols/S2"; // Renomeado para clareza 
WiFiClient espClient; 
PubSubClient client(espClient); 
unsigned long previousMillis = 0; 
const unsigned long interval = 2000;  
void setup_wifi() { 
WiFi.begin(ssid, password); 
  while(WiFi.status() != WL_CONNECTED) { 
    delay(1000); 
    Serial.print("."); 
  } 
  Serial.println(); 
  Serial.print("Conectado a rede "); 
  Serial.println(ssid); 
  Serial.print("IP do ESP32: "); 
  Serial.println(WiFi.localIP()); 
} 
 
void callback(char* topic, byte* payload, unsigned int length) { 
  String messageTemp; 
  for (int i = 0; i < length; i++) { 
    Serial.print((char)payload[i]); 
    messageTemp += (char)payload[i]; 
  } 
  Serial.println(); 
 
  if (String(topic) == acTopic) { 
    if (messageTemp == "ON") { 
      digitalWrite(25, HIGH);  
      Serial.println("RELÉ S1 LIGADO "); 
    } else if (messageTemp == "OFF") { 
      digitalWrite(25, LOW);  
      Serial.println("RELÉ S1 DESLIGADO "); 
    } 
  } else if (String(topic) == humidifierTopic) { 
    if (messageTemp == "ON") { 
      digitalWrite(26, HIGH);  
      Serial.println("RELÉ S2 LIGADO "); 
    } else if (messageTemp == "OFF") { 
      digitalWrite(26, LOW);  
      Serial.println("RELÉ S2 DESLIGADO "); 
    } 
  } 
} 
 
void MQTTSubscribe() { 
  client.subscribe(acTopic); 
  client.subscribe(humidifierTopic); 
} 
 
void connectMQTT() { 
  while(!client.connected()) { 
    Serial.println("Conectando ao MQTT..."); 
    if (client.connect(espClientName)) { 
      Serial.println("Conectado! "); 
      MQTTSubscribe(); 
    } else { 
      Serial.print("Falha: "); 
      Serial.println(client.state()); 
      delay(2000);  
    } 
  } 
} 
 
void setup_MQTT() { 
  client.setServer(hostname, PORTNUM); 
  client.setCallback(callback); 
} 
 
void setup() { 
  Serial.begin(115200);  
  pinMode(25, OUTPUT); 
  pinMode(26, OUTPUT); 
  Wire.begin(21, 22); 
  lcd.init(); 
  lcd.backlight(); 
  dht.begin(); 
  setup_wifi(); 
  setup_MQTT(); 
} 
 
void loop() { 
  if (!client.connected()) { 
    connectMQTT(); 
  } 
  client.loop(); 
 
  unsigned long currentMillis = millis(); 
  if (currentMillis - previousMillis >= interval) { 
    previousMillis = currentMillis; 
 
    float temperature = dht.readTemperature(); 
    float humidity = dht.readHumidity(); 
 
    // Verifica se a leitura foi bem sucedida 
    if (isnan(temperature) || isnan(humidity)) { 
      Serial.println("Falha ao ler do sensor DHT!"); 
      return; 
    } 
 
    Serial.print("Temperatura: "); 
    Serial.print(temperature); 
    Serial.print(" C "); 
    Serial.print("Umidade: "); 
    Serial.print(humidity); 
    Serial.println(" %"); 
 
    //lcd.clear(); 
    lcd.setCursor(0, 0); 
    lcd.print("   Temp: "); 
    lcd.print(temperature); 
    lcd.print(" C"); 
    lcd.setCursor(0, 1); 
    lcd.print("Umidade: "); 
    lcd.print(humidity); 
    lcd.print(" %"); 
     
    // --- PUBLICAÇÃO DOS DADOS PARA O MQTT --- 
    // NOVO: Converte os valores float para char array 
    char tempString[8]; 
    dtostrf(temperature, 1, 2, tempString); // Converte float para string 
 
    char humidityString[8]; 
    dtostrf(humidity, 1, 2, humidityString); // Converte float para string 
 
    // NOVO: Publica os valores nos tópicos definidos 
    client.publish(tempTopic, tempString); 
    client.publish(humidityTopic, humidityString); 
 
    Serial.print("Publicado no MQTT -> Temp: "); 
Serial.print(tempString); 
Serial.print(" | Umidade: "); 
Serial.println(humidityString); 
// --- FIM DA PUBLICAÇÃO --- 
} 
} 