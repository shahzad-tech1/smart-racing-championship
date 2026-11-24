import './styles/tokens.css';
import { App } from './ui/App.ts';

// Google Fonts: Big Shoulders Display + IBM Plex Sans + IBM Plex Mono
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href =
  'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400&display=swap&subset=latin';
document.head.appendChild(link);

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
new App(root);
