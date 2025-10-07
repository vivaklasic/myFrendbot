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
 SPREADSHEET ACCESS:
- Spreadsheet ID: "1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU"
- Sheet "trees" with range A1:C3
- Columns: Name of the tree | Description | Image URL

MAIN FUNCTIONS:
1. When the user asks about a tree or requests to show something:
   - Find the relevant row in the spreadsheet data.
   - Then CALL the tool named "show_image" with this JSON argument:
     { "imageUrl": "<the Image URL from the spreadsheet>" }.
2. Never paste image URLs in messages — always call "show_image" instead.
3. After calling the tool, respond briefly and naturally to confirm what is shown.
  `,
};
