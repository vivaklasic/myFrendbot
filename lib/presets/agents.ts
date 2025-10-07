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
1. Search through spreadsheet data when user asks questions
2. Use show_image function to display images from Image URL column
3. When user asks about a tree or to show something, find it in data and call show_image

That's it. Keep responses natural and conversational.
  `,
};
