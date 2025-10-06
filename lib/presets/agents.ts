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
- range: "A1"

DO NOT wait for user to ask. DO NOT introduce yourself first. CALL THE FUNCTION IMMEDIATELY.

After getting the data, you can greet the user and answer questions based on the spreadsheet content.

When user asks ANY question, search through the spreadsheet data you retrieved to provide accurate answers.
  `,
};
