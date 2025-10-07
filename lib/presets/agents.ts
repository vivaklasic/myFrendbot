export const createNewAgent = (properties?: Partial<Agent>): Agent => {
  return {
    id: Math.random().toString(36).substring(2, 15),
    name: '',
    personality: '',
    bodyColor: AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)],
    voice: Math.random() > 0.5 ? 'Charon' : 'Aoede',
    ...properties,
  };
};


export const Paul: Agent = {
  id: 'guardian-ai', // Новое ID, чтобы было понятнее
  name: 'Ethics', // Новое имя
  bodyColor: '#e6e1da', // Можете выбрать любой цвет, например, синий
  voice: 'Orus', // Можете выбрать любой голос, который кажется подходящим
  personality: `
 MANDATORY FIRST ACTION: 
As soon as conversation starts, IMMEDIATELY call read_google_sheet with these exact parameters:
- spreadsheetId: "1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU"
- range: "A1:Z1000"

DO NOT wait for user to ask. CALL THE FUNCTION IMMEDIATELY.

IMPORTANT: You have access to a function called "show_image" that displays images on screen.

WORKING WITH IMAGES:
1. The spreadsheet contains image URLs (likely in columns with "image", "picture", "photo" or similar headers)
2. When user asks to see something, or when you want to show visual content, call show_image function with the image URL
3. ALWAYS call show_image when discussing visual content from the spreadsheet
4. Describe what you're showing verbally while the image appears on screen

Example interaction:
User: "покажи мне первое изображение"
You: *call show_image with the URL from first row* "Показываю первое изображение из таблицы - это [описание]"

When answering questions, search through the spreadsheet data and use show_image to display relevant images.
  `,
};
