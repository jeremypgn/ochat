const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const cors = require('cors');
const nodemailer = require("nodemailer");
const Redis = require('ioredis');

const transporter = nodemailer.createTransport({
    port: 1025
  });

const redis = new Redis(6379, 'redis');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());
let messages = [];

async function getWeather() {
    const lat = 48.6880839;
    const long = 6.1528394;

    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${long}&current=temperature_2m,wind_speed_10m`);
    const data = await response.json();
    
    return {
        temperature: `${data.current.temperature_2m} ${data.current_units.temperature_2m}`,
        wind_speed: `${data.current.wind_speed_10m} ${data.current_units.wind_speed_10m}`
    };
};

async function updateWeatherData() {
    console.log('Weather data updated!');
    const weatherData = await getWeather();
    const timestamp = Date.now();

    await redis.multi()
        .set('weather:temperature', weatherData.temperature)
        .set('weather:wind_speed',  weatherData.wind_speed)
        .set('weather:last_update', timestamp)
        .exec();
}

async function getWeatherData(){
    const lastUpdate = await redis.get('weather:last_update');
    const now = Date.now();

    if(!lastUpdate || now - lastUpdate > 20 * 60 * 1000){
        await updateWeatherData();
    }

    const temperature = await redis.get('weather:temperature');
    const wind_speed = await redis.get('weather:wind_speed');

    return { temperature, wind_speed };
}

async function loadMessages() {
    try {
        const data = await fs.readFile('./messages.json');
        messages = JSON.parse(data);
        console.log('Messages loaded from messages.json');
    } catch (err) {
        console.error('Error loading messages:', err);
    }
}

async function saveMessages() {
    try {
        await fs.writeFile('./messages.json', JSON.stringify(messages, null, 2));
        console.log('Messages saved in messages.json');
    } catch (err) {
        console.error('Error saving messages:', err);
    }
}

function validateId(req, res, next) {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ error: 'ID must be an integer' });
    }
    req.params.id = id;
    next();
}

function validateMessage(req, res, next) {
    const { username, message } = req.body;
    if (!username || !message) {
        return res.status(400).json({ error: 'Username and message are required' });
    }
    next();
}

loadMessages();

// ce middleware sert à vérifier que mon adresse IP est autorisé à accéder à mon site
// app.use((req, res, next) => {
//     const authorized_ips = ['127.0.0.1'];

//     if(!authorized_ips.includes(req.ip)){
//         return res.status(401).json({ error: 'IP unauthorized' });
//     }

//     next();
// });

// je simule un middleware "lent" que je positionne donc le plus tardivement possible
// app.use((req, res, next) => {
//     setTimeout(() => {
//         next();
//     }, 3000);
// });

app.get('/messages', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const startIndex =  ( page - 1 ) * limit;
    const endIndex = startIndex + limit;

    const messagesPaginate = messages.slice(startIndex, endIndex);

    res.json({
        page,
        limit,
        totalMessages: messages.length,
        totalPages: Math.ceil(messages.length / limit),
        messages: messagesPaginate
     });
});

app.post('/messages', validateMessage, (req, res) => {
    const { username, message } = req.body;
    const newMessage = { id: messages.length + 1, username, message, createdAt: new Date() };
    messages.push(newMessage);
    saveMessages().then(() => {
        res.status(201).json(newMessage);
    });
});

app.get('/messages/:id', validateId, (req, res) => {
    const messageId = req.params.id;
    const message = messages.find(msg => msg.id === messageId);
    if (!message) {
        return res.status(404).json({ error: 'Message not found' });
    }
    res.json(message);
});

app.delete('/messages/:id', validateId, (req, res) => {
    const messageId = req.params.id;
    const index = messages.findIndex(msg => msg.id === messageId);
    if (index === -1) {
        return res.status(404).json({ error: 'Message not found' });
    }
    const deletedMessage = messages.splice(index, 1)[0];
    saveMessages().then(() => {
        res.json(deletedMessage);
    });
});

app.post('/contact', (req, res) => {
    const { email, message } = req.body;

    transporter.sendMail({
        from: email,
        to: "admin@jeremypgn.com",
        subject: "New message support!",
        text: message
    });

    return res.status(200).end();
});

app.get('/weather', async(req, res) => {
    try{
        const weather = await getWeatherData();
        return res.json( { weather });
    }catch(e){
        return res.status(503).json({ error: 'Weather service unavailable' });
    }
});

app.use((req, res, next) => {
    res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${port}`);
});