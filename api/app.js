const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());

let messages = [];

async function loadMessages() {
    try {
        const data = await fs.readFile('./messages.json');
        messages = JSON.parse(data);
        console.log('Messages chargés depuis messages.json');
    } catch (err) {
        console.error('Erreur lors du chargement des messages:', err);
    }
}

async function saveMessages() {
    try {
        await fs.writeFile('./messages.json', JSON.stringify(messages, null, 2));
        console.log('Messages sauvegardés dans messages.json');
    } catch (err) {
        console.error('Erreur lors de la sauvegarde des messages:', err);
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

app.get('/messages', (req, res) => {
    res.json(messages);
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

app.use((req, res, next) => {
    res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});