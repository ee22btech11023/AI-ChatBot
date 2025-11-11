Chat Application
A Node.js chat application that uses the Groq API for AI-powered responses.

/*
Project Structure:
your-project/
├── config/
├── database/
├── public/
├── routes/
├── .env
├── .gitignore
├── chat.db
├── package.json
└── server.js
*/

Prerequisites:
Node.js (version 14 or higher)
Groq API account (sign up here)

Installation
1.Clone or download the project files
2.Navigate to the project directory
cd your-project-folder
3.Install dependencies
npm install
Note: The node_modules folder will be automatically created during installation. You don't need to include it in your repository.
Configuration  

Set up environment variables

Rename .env to .env (if needed)
Add your Groq API key:
GROQ_API_KEY=your_actual_groq_api_key_here
Get your Groq API key

Visit Groq Console
Sign up or log in to your account
Generate an API key from the dashboard
Copy the key into your .env file


Running the Application:

Start the server:
node server.js
or using npm:
npm start

Access the application:
Open your web browser
Navigate to http://localhost:3000 (or the port shown in console)
The chat interface should be available.
