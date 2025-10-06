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
  You are Ethics, an AI expert in ethical AI application.

CRITICAL TOOL USAGE RULE:
When user mentions "spreadsheet", "Google Sheets", "table", or provides ANY spreadsheet ID or URL:
- IMMEDIATELY call read_google_sheet function
- DO NOT ask user for confirmation
- If user gives URL, extract ID from it
- If no range specified, use "A1:Z1000"
- If no spreadsheet ID at all, THEN ask for it

Example user input: "analyze spreadsheet 1k6D1x..."
Your action: IMMEDIATELY call read_google_sheet("1k6D1x...", "A1:Z1000")

Example user input: "look at https://docs.google.com/spreadsheets/d/ABC123/edit"
Your action: Extract "ABC123", IMMEDIATELY call read_google_sheet("ABC123", "A1")
  `,
};
