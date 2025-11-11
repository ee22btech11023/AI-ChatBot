require('dotenv').config();
const express = require('express');
const { Groq } = require('groq-sdk');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));


const db = new sqlite3.Database('./chat.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database');
  }
});


db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    role TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
  )`);
});


const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});


function getChatSessions() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, title, created_at, updated_at 
       FROM chat_sessions 
       ORDER BY updated_at DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}


function getConversationHistory(sessionId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT role, content FROM messages 
       WHERE session_id = ? 
       ORDER BY timestamp ASC`,
      [sessionId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}


function saveMessage(sessionId, role, content, isFirstMessage = false) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      if (isFirstMessage) {
        const title = content.length > 30 ? content.substring(0, 30) + '...' : content;
        db.run(
          `INSERT OR REPLACE INTO chat_sessions (id, title, updated_at) VALUES (?, ?, datetime('now'))`,
          [sessionId, title]
        );
      } else {
        db.run(
          `UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?`,
          [sessionId]
        );
      }
      db.run(
        `INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)`,
        [sessionId, role, content],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });
}

function createNewChatSession() {
  return new Promise((resolve, reject) => {
    const sessionId = uuidv4();
    const title = 'New Chat';
    
    db.run(
      `INSERT INTO chat_sessions (id, title) VALUES (?, ?)`,
      [sessionId, title],
      function(err) {
        if (err) reject(err);
        else resolve(sessionId);
      }
    );
  });
}


function deleteChatSession(sessionId) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`DELETE FROM messages WHERE session_id = ?`, [sessionId]);
      db.run(`DELETE FROM chat_sessions WHERE id = ?`, [sessionId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/chats', async (req, res) => {
  try {
    const sessions = await getChatSessions();
    res.json({ sessions });
  } catch (error) {
    console.error('Error loading chats:', error);
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

app.get('/api/chats/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await getConversationHistory(sessionId);
    res.json({ messages });
  } catch (error) {
    console.error('Error loading chat:', error);
    res.status(500).json({ error: 'Failed to load chat' });
  }
});


app.post('/api/chats/new', async (req, res) => {
  try {
    const sessionId = await createNewChatSession();
    res.json({ sessionId, title: 'New Chat' });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});


app.post('/api/chats/:sessionId/message', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('🔄 Processing message in session:', sessionId);

   
    const existingMessages = await getConversationHistory(sessionId);
    const isFirstMessage = existingMessages.length === 0;


    await saveMessage(sessionId, 'user', message, isFirstMessage);

    
    const history = await getConversationHistory(sessionId);
    

    const recentHistory = history.slice(-15);
    
    const messages = [
      { 
        role: 'system', 
        content: 'You are a helpful, detailed, and enthusiastic AI assistant. Provide comprehensive and thorough responses while maintaining natural conversation flow.' 
      },
      ...recentHistory.map(msg => ({ role: msg.role, content: msg.content }))
    ];

    console.log(`📝 Sending ${messages.length} messages to AI`);

   
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: messages,
      max_tokens: 2000,
      temperature: 0.7,
      top_p: 0.9,
      frequency_penalty: 0.1,
      presence_penalty: 0.1,
      stream: false
    });

    const aiResponse = completion.choices[0].message.content;
    const tokensUsed = completion.usage.total_tokens;
    
    console.log('✅ AI Response:', aiResponse);
    console.log(`📊 Tokens used: ${tokensUsed}`);

   
    await saveMessage(sessionId, 'assistant', aiResponse);

    res.json({
      response: aiResponse,
      sessionId: sessionId,
      tokensUsed: tokensUsed
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    
   
    if (error.message.includes('rate limit')) {
      res.status(429).json({ 
        error: 'Rate limit exceeded. Please wait a moment and try again.' 
      });
    } else if (error.message.includes('quota')) {
      res.status(429).json({ 
        error: 'API quota exceeded. Please check your Groq account.' 
      });
    } else {
      res.status(500).json({ 
        error: 'AI service error: ' + error.message 
      });
    }
  }
});

app.delete('/api/chats/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await deleteChatSession(sessionId);
    res.json({ message: 'Chat deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});


app.get('/api/chats/:sessionId/export', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await getConversationHistory(sessionId);
    const session = await new Promise((resolve) => {
      db.get('SELECT title FROM chat_sessions WHERE id = ?', [sessionId], (err, row) => {
        resolve(row);
      });
    });
    
    let exportText = `AI Chat Export\n`;
    exportText += `Title: ${session?.title || 'Untitled'}\n`;
    exportText += `Exported: ${new Date().toLocaleString()}\n`;
    exportText += `========================================\n\n`;
    
    messages.forEach(msg => {
      const role = msg.role === 'user' ? 'You' : 'AI Assistant';
      exportText += `${role}: ${msg.content}\n\n`;
    });
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename=chat-${sessionId}.txt`);
    res.send(exportText);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

app.listen(port, () => {
  console.log(`🚀 AI Chat Assistant running on http://localhost:${port}`);
  console.log('✅ Multiple chat sessions supported');
  console.log('✅ SQLite database persistence');
  console.log('✅ Groq AI integration');
});