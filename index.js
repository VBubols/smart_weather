require('dotenv').config(); 
const mqtt = require('mqtt'); 
const { GoogleGenAI } = require('@google/genai'); 
const PDFDocument = require('pdfkit'); 
const fs = require('fs'); 
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js'); 
const qrcode = require('qrcode-terminal'); 
// ========================================== 
// 1. CONFIGURAÇÕES INICIAIS 
// ========================================== 
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); 
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com'); 
// Variáveis para guardar a última leitura do ESP32 
let ultimaTemperatura = "N/A"; 
let ultimaUmidade = "N/A"; 
// ========================================== 
// 2. INTEGRAÇÃO COM O ESP32 (MQTT) 
// ========================================== 
mqttClient.on('connect', () => { 
    console.log('  Conectado ao HiveMQ!'); 
    mqttClient.subscribe('bubols/temp'); 
    mqttClient.subscribe('bubols/hum'); 
}); 
 
mqttClient.on('message', (topic, message) => { 
    const valor = message.toString(); 
    if (topic === 'bubols/temp') ultimaTemperatura = valor; 
    if (topic === 'bubols/hum') ultimaUmidade = valor; 
}); 
 
// ========================================== 
// 3. INTEGRAÇÃO COM O WHATSAPP 
// ========================================== 
// Usamos LocalAuth para não precisar ler o QR Code toda vez que reiniciar 
const wppClient = new Client({ authStrategy: new LocalAuth() }); 
 
wppClient.on('qr', (qr) => { 
    console.log('  Leia o QR Code abaixo com seu WhatsApp:'); 
    qrcode.generate(qr, { small: true }); 
}); 
 
wppClient.on('ready', () => { 
    console.log('  Bot do WhatsApp conectado e pronto!'); 
}); 
 
wppClient.on('message', async (msg) => { 
    // Quando alguém mandar "!relatorio", disparamos a automação 
    if (msg.body === '!relatorio') { 
        msg.reply('  Entendido! Solicitando análise da IA e gerando o PDF. Aguarde um instante...'); 
         
        try { 
            const nomeArquivo = await gerarRelatorioIA(); 
             
            // Lemos o arquivo PDF recém-criado 
            const media = MessageMedia.fromFilePath(nomeArquivo); 
             
            // Enviamos o arquivo de volta para quem pediu 
            await wppClient.sendMessage(msg.from, media, { caption: '  Aqui está o seu Laudo do Smart Weather!' }); 
             
            console.log('  PDF enviado com sucesso!'); 
        } catch (error) { 
            console.error(error); 
            msg.reply('  Ocorreu um erro ao gerar o relatório.'); 
        } 
    } 
     
    // BÔNUS: Comando para ligar o Relé S1 do seu projeto (Ar condicionado) 
    if (msg.body === '!ligar_ar') { 
        mqttClient.publish('bubols/S1', 'ON'); 
        msg.reply('  Comando enviado para ligar o Ar Condicionado (Relé S1).'); 
    } 
}); 
 
wppClient.initialize(); 
 
// ========================================== 
// 4. FUNÇÃO GERADORA DE PDF E ANÁLISE IA 
// ========================================== 
async function gerarRelatorioIA() { 
    return new Promise(async (resolve, reject) => { 
        try { 
            console.log('  Analisando dados com Gemini...'); 
             
            const prompt = ` 
            Você é um especialista em climatização e ambientes inteligentes. 
            Analise os dados climáticos atuais do nosso ambiente: 
            - Temperatura: ${ultimaTemperatura}°C 
            - Umidade: ${ultimaUmidade}% 
             
            Baseado na norma de conforto térmico (NR 17), retorne um breve relatório com: 
            1. Avaliação do conforto térmico atual. 
            2. Possíveis riscos (ex: mofo se umidade alta, ressecamento se baixa). 
            3. Recomendação de automação (Ligar Ar condicionado ou Umidificador). 
            Não use formatação Markdown pesada, responda em texto simples. 
            `; 
 
            const response = await ai.models.generateContent({ 
                model: 'gemini-3.5-flash', 
                contents: prompt, 
            }); 
 
            const analiseIA = response.text; 
             
            console.log('  Gerando PDF...'); 
            const doc = new PDFDocument(); 
            const caminhoPDF = `./Laudo_Climatico_${Date.now()}.pdf`; 
             
            const stream = fs.createWriteStream(caminhoPDF); 
            doc.pipe(stream); 
 
            doc.fontSize(18).font('Helvetica-Bold').text('Laudo Climatológico - Smart Weather', { align: 'center' }); 
            doc.moveDown(); 
            doc.fontSize(12).font('Helvetica').text(`Data/Hora: ${new Date().toLocaleString('pt-BR')}`); 
            doc.text(`Temperatura Atual: ${ultimaTemperatura} °C`); 
            doc.text(`Umidade Atual: ${ultimaUmidade} %`); 
            doc.moveDown(2); 
            doc.fontSize(14).font('Helvetica-Bold').text('Análise da Inteligência Artificial:'); 
            doc.moveDown(); 
            doc.fontSize(12).font('Helvetica').text(analiseIA, { align: 'justify' }); 
             
            doc.end(); 
 
            // Espera o arquivo ser salvo no disco antes de resolver a promessa 
            stream.on('finish', () => resolve(caminhoPDF)); 
            stream.on('error', reject); 
 
        } catch (err) { 
            reject(err); 
        } 
    }); 
} 
 
 