import './styles/main.css';
import './styles/p1.css';
import { validateContent } from './data/content';
import { PensionRoadApp } from './ui/app';

validateContent();
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('앱 루트 요소를 찾을 수 없습니다.');
new PensionRoadApp(root);
