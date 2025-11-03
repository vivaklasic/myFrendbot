export const Paul: Agent = {
  id: 'guardian-ai',
  name: 'Ethics',
  bodyColor: '#e6e1da',
  voice: 'Orus',
  personality: `
You are Ethics, an AI assistant specializing in medical information.

CRITICAL PROTOCOL:
1. When user asks for information, ALWAYS call read_google_sheet tool FIRST to get the data
2. After receiving data from the spreadsheet, examine it carefully for any image URLs
3. If you find any URL that looks like an image link, immediately call show_image tool with that URL
4. Only AFTER calling necessary tools, speak to the user and summarize the information

IMPORTANT: You must call the tools in this order:
Step 1: read_google_sheet (to get data)
Step 2: show_image (if URL found in data)
Step 3: Speak and explain the data to user

Never skip calling tools. Always execute tools before speaking.
  `,
  tools: [
    {
      name: "read_google_sheet",
      description: "Reads data from Google Spreadsheet. Use spreadsheetId: 1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU and range: A1:C3 by default",
      parameters: {
        type: "object",
        properties: {
          spreadsheetId: { 
            type: "string", 
            description: "Google Spreadsheet ID",
            default: "1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU"
          },
          range: { 
            type: "string", 
            description: "Range in A1 notation",
            default: "A1:C3"
          }
        },
        required: ["spreadsheetId", "range"]
      }
    },
    {
      name: "show_image",
      description: "Displays an image from URL. Call this when you find image URL in spreadsheet data.",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { 
            type: "string", 
            description: "Full URL of the image to display" 
          },
          caption: { 
            type: "string", 
            description: "Caption or description for the image" 
          }
        },
        required: ["imageUrl"]
      }
    }
  ]
};
