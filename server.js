const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { performance } = require('perf_hooks');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

app.post('/log-questions', async (req, res) => {
    const startTime = performance.now();
    const questions = req.body.questions;

    if (!questions) {
        return res.status(400).json({ error: 'No questions provided' });
    }

    if (questions.length === 0) {
        return res.status(400).json({ error: 'No questions provided' });
    }

    const gemini_api_key = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(gemini_api_key);

    const results = [];

    const safety_settings = [
        {
            "category": "HARM_CATEGORY_HARASSMENT",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_HATE_SPEECH",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
            "threshold": "BLOCK_NONE"
        },
    ]

    const generation_config = {
        "temperature": 0.2,
        "top_k": 50,
        "top_p": 0.9,
    }

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const processQuestion = async (questionData) => {
        const question = questionData.question;
        const type = questionData.type;
        const answers = questionData.answers;

        if (type === 'multiple_choice') {
            const answersWithId = answers.map((answer, index) => `${index + 1}: ${answer}`);

            const systemPrompt = `
                You are an assistant for evaluating multiple-choice questions.
                You will receive a question and a list of possible answers. Each answer has a unique ID.
                Your task is to carefully think through and consider your answer before selecting only ONE ID of the correct answer from the given options and returning it.
                If either the question or the answers are missing, return "[null]".
                If you’re not sure which answer is correct or if you don't know the answer, return 0.
                Do not generate any additional text, only the ID of the correct answer.
                Always write the answer exactly as it is provided.
            `;

            try {
                const model = genAI.getGenerativeModel({
                    model: "gemini-1.5-flash",
                    safetySettings:safety_settings,
                    generationConfig: generation_config,
                    systemInstruction: systemPrompt,
                });

                const prompt = `${question}\nMožnosti:\n${answersWithId.join('\n')}`;
                const response = await model.generateContent(prompt);

                const generatedAnswerId = response.response.text().trim();

                results.push({ question: question, correctAnswerId: generatedAnswerId, type: "multiple_choice",});
            } catch (error) {
                console.error(`Chyba při volání Gemini API: ${error}`);
                results.push({ question: question, error: "Chyba při zpracování otázky." });
            }
        } else if (type === 'checkbox') {
            const answersWithId = answers.map((answer, index) => `${index + 1}: ${answer}`);

            const systemPrompt = `
                You are an assistant for evaluating multiple-choice questions.
                You will receive a question and a list of possible answers. Each answer has a unique ID.
                Your task is to carefully think through and consider your answer before 
                selecting the ID of the correct answer from the given options. 
                If there are multiple correct answers, you may return all relevant IDs.
                If either the question or the answers are missing, return "[null]".
                If you’re not sure which answer is correct or if you don't know the answer, return 0.
                Do not generate any additional text, only the ID(s) of the correct answer(s).
                Always write the answer exactly as it is provided.
                nejdrive premysli nad odpovedi, nad kazdou z moznosti, a pokud si nejses jistej danou odpovedi tak ji nedavej, davej jen ty odpovedi kteryma si jses na 100% jistej
            `;

            try {
                const model = genAI.getGenerativeModel({
                    model: "gemini-1.5-flash",
                    safetySettings:safety_settings,
                    generationConfig: generation_config,
                    systemInstruction: systemPrompt,
                });

                const prompt = `${question}\nMožnosti:\n${answersWithId.join('\n')}`;
                const response = await model.generateContent(prompt);

                const generatedAnswerId = response.response.text().trim();

                const answerIds = generatedAnswerId.split(',').map(id => parseInt(id.trim(), 10));

                results.push({ question: question, correctAnswerIds: answerIds, type: "checkbox", });
            } catch (error) {
                console.error(`Chyba při volání Gemini API: ${error}`);
                results.push({ question: question, error: "Chyba při zpracování otázky." });
            }
        }
    };

    for (const question of questions) {
        await processQuestion(question);
        await delay(1000);
    }    

    res.json(results);
    const endTime = performance.now();
    const duration = endTime - startTime;
    const time = `Execution time: ${duration.toFixed(2)} milliseconds`;
    console.log(time)
});

// Spusťte server
app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});
