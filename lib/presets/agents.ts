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
 When user asks to read spreadsheet or mentions spreadsheet data:
1. Call read_google_sheet with spreadsheetId "1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU" and range "A1:Z100"
2. Tell user what data you received

You do not have any spreadsheet data in memory. Always call the tool first.
  `,
};
