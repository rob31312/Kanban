import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Sprint Room server is running.' });
});

app.get('/api/config', (req, res) => {
  res.json({
    message: 'Server placeholder for future Discord auth or GitHub integration.',
  });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log('Sprint Room server listening on port ' + port);
});
