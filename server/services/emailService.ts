import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    const emailData: any = {
      to: params.to,
      from: params.from,
      subject: params.subject,
    };
    
    if (params.text) {
      emailData.text = params.text;
    }
    if (params.html) {
      emailData.html = params.html;
    }
    
    await mailService.send(emailData);
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

interface JournalEntryEmailData {
  entryTitle: string;
  entryPreview: string;
  entryUrl: string;
  senderName: string;
  senderEmail: string;
}

export async function sendJournalEntryEmail(
  recipientEmail: string,
  senderEmail: string,
  data: JournalEntryEmailData
): Promise<boolean> {
  const subject = `${data.senderName} shared a journal entry with you${data.entryTitle ? `: ${data.entryTitle}` : ''}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .container {
          background: white;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 1px solid #e9ecef;
          padding-bottom: 20px;
        }
        .title {
          font-size: 24px;
          font-weight: 600;
          color: #2c3e50;
          margin: 0 0 10px 0;
        }
        .subtitle {
          color: #6c757d;
          font-size: 16px;
          margin: 0;
        }
        .content {
          margin: 30px 0;
        }
        .entry-preview {
          background: #f8f9fa;
          border-left: 4px solid #007bff;
          padding: 20px;
          margin: 20px 0;
          border-radius: 4px;
          font-style: italic;
        }
        .cta-button {
          display: inline-block;
          background: #007bff;
          color: white;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-weight: 500;
          margin: 20px 0;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e9ecef;
          font-size: 14px;
          color: #6c757d;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="title">Journal Entry Shared</h1>
          <p class="subtitle">${data.senderName} shared something with you</p>
        </div>
        
        <div class="content">
          <p>Hi there!</p>
          <p>${data.senderName} (${data.senderEmail}) has shared a journal entry with you.</p>
          
          ${data.entryTitle ? `<h3>${data.entryTitle}</h3>` : ''}
          
          <div class="entry-preview">
            ${data.entryPreview}
          </div>
          
          <p>Click the link below to view the full entry:</p>
          
          <a href="${data.entryUrl}" class="cta-button">View Journal Entry</a>
          
          <p><small>If the button doesn't work, copy and paste this link into your browser:<br>
          ${data.entryUrl}</small></p>
        </div>
        
        <div class="footer">
          <p>This email was sent because ${data.senderName} shared a journal entry with you.<br>
          You can view and interact with the entry by clicking the link above.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
${data.senderName} shared a journal entry with you

${data.entryTitle ? `Title: ${data.entryTitle}` : ''}

Preview:
${data.entryPreview}

View the full entry at: ${data.entryUrl}

This email was sent because ${data.senderName} (${data.senderEmail}) shared a journal entry with you.
  `;

  return await sendEmail({
    to: recipientEmail,
    from: senderEmail,
    subject,
    html,
    text
  });
}