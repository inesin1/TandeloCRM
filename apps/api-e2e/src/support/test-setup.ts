import axios from 'axios';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ?? '3001';
axios.defaults.baseURL = `http://${host}:${port}`;
