/**
 * Email Service with Resend Integration
 * 
 * Provides email sending capabilities for:
 * - Collaborator invitations
 * - Role change notifications
 * - Activity alerts
 * 
 * Uses Resend (https://resend.com) as the email provider.
 */

import { Invitation, Collaborator, CollaboratorRole, ROLE_HIERARCHY } from './collaborators';

/**
 * Email configuration
 */
export interface EmailConfig {
  apiKey: string;
  fromAddress: string;
  fromName: string;
  replyTo?: string;
  
  // Repository context
  repositoryName: string;
  repositoryUrl?: string;
  
  // Customization
  inviteBaseUrl?: string;
  logoUrl?: string;
  primaryColor?: string;
}

/**
 * Email template data
 */
export interface EmailTemplateData {
  recipientName?: string;
  recipientEmail: string;
  inviterName?: string;
  inviterEmail: string;
  role: CollaboratorRole;
  repositoryName: string;
  repositoryUrl?: string;
  inviteUrl: string;
  expiresAt: Date;
  message?: string;
}

/**
 * Email send result
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Resend API response
 */
interface ResendResponse {
  id?: string;
  error?: {
    message: string;
    name: string;
  };
}

/**
 * Role display names for emails
 */
const ROLE_DISPLAY_NAMES: Record<CollaboratorRole, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  maintainer: 'Maintainer',
  contributor: 'Contributor',
  viewer: 'Viewer',
};

/**
 * Role descriptions for emails
 */
const ROLE_DESCRIPTIONS: Record<CollaboratorRole, string> = {
  owner: 'Full access including repository deletion and settings management',
  admin: 'Full access to code, settings, and collaborator management',
  maintainer: 'Can manage branches, merges, and releases',
  contributor: 'Can push to non-protected branches',
  viewer: 'Read-only access to the repository',
};

/**
 * Email Service
 * 
 * Handles all email operations using the Resend API.
 */
export class EmailService {
  private apiKey: string;
  private fromAddress: string;
  private fromName: string;
  private replyTo?: string;
  private repositoryName: string;
  private repositoryUrl?: string;
  private inviteBaseUrl: string;
  private logoUrl?: string;
  private primaryColor: string;

  constructor(config: EmailConfig) {
    this.apiKey = config.apiKey;
    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName;
    this.replyTo = config.replyTo;
    this.repositoryName = config.repositoryName;
    this.repositoryUrl = config.repositoryUrl;
    this.inviteBaseUrl = config.inviteBaseUrl || 'https://wit.dev/invite';
    this.logoUrl = config.logoUrl;
    this.primaryColor = config.primaryColor || '#6366f1';
  }

  /**
   * Send a collaborator invitation email
   */
  async sendInvitation(
    invitation: Invitation,
    inviterName?: string
  ): Promise<EmailResult> {
    const inviteUrl = `${this.inviteBaseUrl}/${invitation.token}`;
    const expiresAt = new Date(invitation.expiresAt);

    const templateData: EmailTemplateData = {
      recipientEmail: invitation.email,
      inviterName,
      inviterEmail: invitation.invitedBy,
      role: invitation.role,
      repositoryName: this.repositoryName,
      repositoryUrl: this.repositoryUrl,
      inviteUrl,
      expiresAt,
      message: invitation.message,
    };

    const html = this.renderInvitationEmail(templateData);
    const text = this.renderInvitationEmailText(templateData);

    return this.send({
      to: invitation.email,
      subject: `You've been invited to collaborate on ${this.repositoryName}`,
      html,
      text,
    });
  }

  /**
   * Send a role change notification
   */
  async sendRoleChangeNotification(
    collaborator: Collaborator,
    previousRole: CollaboratorRole,
    changedBy: string
  ): Promise<EmailResult> {
    const isPromotion = ROLE_HIERARCHY[collaborator.role] > ROLE_HIERARCHY[previousRole];
    const action = isPromotion ? 'promoted' : 'updated';

    const html = this.renderRoleChangeEmail({
      recipientName: collaborator.name,
      recipientEmail: collaborator.email,
      previousRole,
      newRole: collaborator.role,
      changedBy,
      repositoryName: this.repositoryName,
      repositoryUrl: this.repositoryUrl,
      isPromotion,
    });

    const text = `Your role in ${this.repositoryName} has been ${action} from ${ROLE_DISPLAY_NAMES[previousRole]} to ${ROLE_DISPLAY_NAMES[collaborator.role]} by ${changedBy}.`;

    return this.send({
      to: collaborator.email,
      subject: `Your role in ${this.repositoryName} has been ${action}`,
      html,
      text,
    });
  }

  /**
   * Send a removal notification
   */
  async sendRemovalNotification(
    email: string,
    name: string | undefined,
    removedBy: string
  ): Promise<EmailResult> {
    const html = this.renderRemovalEmail({
      recipientName: name,
      recipientEmail: email,
      removedBy,
      repositoryName: this.repositoryName,
    });

    const text = `You have been removed from ${this.repositoryName} by ${removedBy}.`;

    return this.send({
      to: email,
      subject: `You've been removed from ${this.repositoryName}`,
      html,
      text,
    });
  }

  /**
   * Send an email using Resend API
   */
  private async send(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<EmailResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${this.fromName} <${this.fromAddress}>`,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          reply_to: this.replyTo,
        }),
      });

      const data = await response.json() as ResendResponse;

      if (!response.ok) {
        return {
          success: false,
          error: data.error?.message || 'Failed to send email',
        };
      }

      return {
        success: true,
        messageId: data.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Render invitation email HTML
   */
  private renderInvitationEmail(data: EmailTemplateData): string {
    const inviterDisplay = data.inviterName || data.inviterEmail;
    const roleDisplay = ROLE_DISPLAY_NAMES[data.role];
    const roleDescription = ROLE_DESCRIPTIONS[data.role];
    const expiresFormatted = data.expiresAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to ${data.repositoryName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              ${this.logoUrl ? `<img src="${this.logoUrl}" alt="Logo" style="height: 40px; margin-bottom: 20px;">` : ''}
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">
                You're invited to collaborate
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                <strong>${inviterDisplay}</strong> has invited you to join 
                <strong>${data.repositoryName}</strong> as a <strong>${roleDisplay}</strong>.
              </p>
              
              ${data.message ? `
              <div style="margin: 20px 0; padding: 16px; background-color: #fafafa; border-radius: 8px; border-left: 4px solid ${this.primaryColor};">
                <p style="margin: 0; font-size: 14px; color: #52525b; font-style: italic;">
                  "${data.message}"
                </p>
              </div>
              ` : ''}
              
              <!-- Role Card -->
              <div style="margin: 30px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px;">
                <h3 style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">
                  Your Role
                </h3>
                <p style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: ${this.primaryColor};">
                  ${roleDisplay}
                </p>
                <p style="margin: 0; font-size: 14px; color: #52525b;">
                  ${roleDescription}
                </p>
              </div>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.inviteUrl}" 
                   style="display: inline-block; padding: 14px 32px; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);">
                  Accept Invitation
                </a>
              </div>
              
              <p style="margin: 20px 0 0; font-size: 14px; color: #71717a; text-align: center;">
                This invitation expires on <strong>${expiresFormatted}</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              ${data.repositoryUrl ? `
              <p style="margin: 10px 0 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                <a href="${data.repositoryUrl}" style="color: ${this.primaryColor}; text-decoration: none;">
                  View Repository
                </a>
              </p>
              ` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Render invitation email plain text
   */
  private renderInvitationEmailText(data: EmailTemplateData): string {
    const inviterDisplay = data.inviterName || data.inviterEmail;
    const roleDisplay = ROLE_DISPLAY_NAMES[data.role];
    const roleDescription = ROLE_DESCRIPTIONS[data.role];
    const expiresFormatted = data.expiresAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let text = `You're invited to collaborate on ${data.repositoryName}

${inviterDisplay} has invited you to join ${data.repositoryName} as a ${roleDisplay}.

`;

    if (data.message) {
      text += `Message from ${inviterDisplay}:
"${data.message}"

`;
    }

    text += `Your Role: ${roleDisplay}
${roleDescription}

Accept your invitation here:
${data.inviteUrl}

This invitation expires on ${expiresFormatted}.

If you didn't expect this invitation, you can safely ignore this email.
`;

    return text;
  }

  /**
   * Render role change email HTML
   */
  private renderRoleChangeEmail(data: {
    recipientName?: string;
    recipientEmail: string;
    previousRole: CollaboratorRole;
    newRole: CollaboratorRole;
    changedBy: string;
    repositoryName: string;
    repositoryUrl?: string;
    isPromotion: boolean;
  }): string {
    const previousRoleDisplay = ROLE_DISPLAY_NAMES[data.previousRole];
    const newRoleDisplay = ROLE_DISPLAY_NAMES[data.newRole];
    const newRoleDescription = ROLE_DESCRIPTIONS[data.newRole];
    const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi,';
    const emoji = data.isPromotion ? '🎉' : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Role Update - ${data.repositoryName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #18181b;">
                ${emoji} Your role has been updated
              </h1>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                ${greeting}
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Your role in <strong>${data.repositoryName}</strong> has been updated by <strong>${data.changedBy}</strong>.
              </p>
              
              <!-- Role Change -->
              <div style="margin: 30px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px; text-align: center;">
                <span style="display: inline-block; padding: 8px 16px; background-color: #e4e4e7; border-radius: 6px; font-size: 14px; color: #52525b;">
                  ${previousRoleDisplay}
                </span>
                <span style="display: inline-block; margin: 0 12px; font-size: 20px; color: #a1a1aa;">→</span>
                <span style="display: inline-block; padding: 8px 16px; background-color: ${this.primaryColor}; border-radius: 6px; font-size: 14px; color: #ffffff; font-weight: 600;">
                  ${newRoleDisplay}
                </span>
              </div>
              
              <p style="margin: 20px 0; font-size: 14px; color: #52525b;">
                <strong>What this means:</strong> ${newRoleDescription}
              </p>
              
              ${data.repositoryUrl ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.repositoryUrl}" 
                   style="display: inline-block; padding: 12px 24px; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">
                  Go to Repository
                </a>
              </div>
              ` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Render removal email HTML
   */
  private renderRemovalEmail(data: {
    recipientName?: string;
    recipientEmail: string;
    removedBy: string;
    repositoryName: string;
  }): string {
    const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi,';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Removed from ${data.repositoryName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #18181b;">
                Access Removed
              </h1>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                ${greeting}
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Your access to <strong>${data.repositoryName}</strong> has been removed by <strong>${data.removedBy}</strong>.
              </p>
              
              <p style="margin: 20px 0 0; font-size: 14px; color: #71717a;">
                If you believe this was done in error, please contact the repository owner.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Verify email configuration is valid
   */
  async verifyConfiguration(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'Resend API key is not configured' };
    }

    if (!this.fromAddress) {
      return { valid: false, error: 'From address is not configured' };
    }

    // Verify API key by making a test request
    try {
      const response = await fetch('https://api.resend.com/domains', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const data = await response.json() as ResendResponse;
        return { 
          valid: false, 
          error: data.error?.message || 'Invalid API key' 
        };
      }

      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Failed to verify configuration' 
      };
    }
  }
}

/**
 * Create an email service from collaborator config
 */
export function createEmailService(config: {
  resendApiKey: string;
  emailFromAddress: string;
  emailFromName?: string;
  repositoryName: string;
  repositoryUrl?: string;
}): EmailService {
  return new EmailService({
    apiKey: config.resendApiKey,
    fromAddress: config.emailFromAddress,
    fromName: config.emailFromName || 'wit',
    repositoryName: config.repositoryName,
    repositoryUrl: config.repositoryUrl,
  });
}
