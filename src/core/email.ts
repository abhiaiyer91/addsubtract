/**
 * Email Service with Resend Integration
 * 
 * Provides email sending capabilities for:
 * - Collaborator invitations
 * - Role change notifications
 * - Activity alerts
 * - Password reset
 * - Email verification
 * - Welcome emails
 * - Notification emails
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

// ============ Global Email Service ============

/**
 * Global email configuration (not repository-specific)
 */
export interface GlobalEmailConfig {
  apiKey: string;
  fromAddress: string;
  fromName: string;
  appUrl: string;
  appName?: string;
  logoUrl?: string;
  primaryColor?: string;
}

/**
 * Global Email Service for app-wide emails
 * Used for: password reset, email verification, welcome emails, notifications
 */
export class GlobalEmailService {
  private apiKey: string;
  private fromAddress: string;
  private fromName: string;
  private appUrl: string;
  private appName: string;
  private logoUrl?: string;
  private primaryColor: string;

  constructor(config: GlobalEmailConfig) {
    this.apiKey = config.apiKey;
    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName;
    this.appUrl = config.appUrl;
    this.appName = config.appName || 'wit';
    this.logoUrl = config.logoUrl;
    this.primaryColor = config.primaryColor || '#6366f1';
  }

  /**
   * Check if email service is configured
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey && this.fromAddress);
  }

  /**
   * Send a password reset email
   */
  async sendPasswordReset(options: {
    email: string;
    name?: string;
    resetUrl: string;
    expiresInMinutes?: number;
  }): Promise<EmailResult> {
    const { email, name, resetUrl, expiresInMinutes = 60 } = options;
    
    const html = this.renderPasswordResetEmail({ email, name, resetUrl, expiresInMinutes });
    const text = this.renderPasswordResetEmailText({ email, name, resetUrl, expiresInMinutes });

    return this.send({
      to: email,
      subject: `Reset your ${this.appName} password`,
      html,
      text,
    });
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(options: {
    email: string;
    name?: string;
    verifyUrl: string;
    expiresInMinutes?: number;
  }): Promise<EmailResult> {
    const { email, name, verifyUrl, expiresInMinutes = 1440 } = options; // 24 hours
    
    const html = this.renderEmailVerificationEmail({ email, name, verifyUrl, expiresInMinutes });
    const text = this.renderEmailVerificationEmailText({ email, name, verifyUrl, expiresInMinutes });

    return this.send({
      to: email,
      subject: `Verify your ${this.appName} email`,
      html,
      text,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(options: {
    email: string;
    name?: string;
    username: string;
  }): Promise<EmailResult> {
    const { email, name, username } = options;
    
    const html = this.renderWelcomeEmail({ email, name, username });
    const text = this.renderWelcomeEmailText({ email, name, username });

    return this.send({
      to: email,
      subject: `Welcome to ${this.appName}!`,
      html,
      text,
    });
  }

  /**
   * Send notification email
   */
  async sendNotificationEmail(options: {
    email: string;
    name?: string;
    notifications: Array<{
      type: string;
      title: string;
      body?: string;
      url?: string;
      actorName?: string;
    }>;
  }): Promise<EmailResult> {
    const { email, name, notifications } = options;
    
    const html = this.renderNotificationEmail({ email, name, notifications });
    const text = this.renderNotificationEmailText({ email, name, notifications });

    const subject = notifications.length === 1
      ? notifications[0].title
      : `You have ${notifications.length} new notifications`;

    return this.send({
      to: email,
      subject,
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
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Email service is not configured. Set RESEND_API_KEY and EMAIL_FROM_ADDRESS.',
      };
    }

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
        }),
      });

      const data = await response.json() as { id?: string; error?: { message: string } };

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
   * Render password reset email HTML
   */
  private renderPasswordResetEmail(data: {
    email: string;
    name?: string;
    resetUrl: string;
    expiresInMinutes: number;
  }): string {
    const greeting = data.name ? `Hi ${data.name},` : 'Hi,';
    const expiresText = data.expiresInMinutes >= 60
      ? `${Math.floor(data.expiresInMinutes / 60)} hour${Math.floor(data.expiresInMinutes / 60) > 1 ? 's' : ''}`
      : `${data.expiresInMinutes} minute${data.expiresInMinutes > 1 ? 's' : ''}`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              ${this.logoUrl ? `<img src="${this.logoUrl}" alt="${this.appName}" style="height: 40px; margin-bottom: 20px;">` : ''}
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">
                Reset your password
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                ${greeting}
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                We received a request to reset your password for your ${this.appName} account. Click the button below to set a new password:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.resetUrl}" 
                   style="display: inline-block; padding: 14px 32px; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);">
                  Reset Password
                </a>
              </div>
              
              <p style="margin: 20px 0; font-size: 14px; color: #71717a;">
                This link will expire in <strong>${expiresText}</strong>.
              </p>
              
              <p style="margin: 20px 0 0; font-size: 14px; color: #71717a;">
                If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 10px 0 0; font-size: 12px; color: ${this.primaryColor}; text-align: center; word-break: break-all;">
                ${data.resetUrl}
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
   * Render password reset email plain text
   */
  private renderPasswordResetEmailText(data: {
    email: string;
    name?: string;
    resetUrl: string;
    expiresInMinutes: number;
  }): string {
    const greeting = data.name ? `Hi ${data.name},` : 'Hi,';
    const expiresText = data.expiresInMinutes >= 60
      ? `${Math.floor(data.expiresInMinutes / 60)} hour${Math.floor(data.expiresInMinutes / 60) > 1 ? 's' : ''}`
      : `${data.expiresInMinutes} minute${data.expiresInMinutes > 1 ? 's' : ''}`;

    return `${greeting}

We received a request to reset your password for your ${this.appName} account.

Click the link below to set a new password:
${data.resetUrl}

This link will expire in ${expiresText}.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
`;
  }

  /**
   * Render email verification email HTML
   */
  private renderEmailVerificationEmail(data: {
    email: string;
    name?: string;
    verifyUrl: string;
    expiresInMinutes: number;
  }): string {
    const greeting = data.name ? `Hi ${data.name},` : 'Hi,';
    const expiresText = data.expiresInMinutes >= 60
      ? `${Math.floor(data.expiresInMinutes / 60)} hour${Math.floor(data.expiresInMinutes / 60) > 1 ? 's' : ''}`
      : `${data.expiresInMinutes} minute${data.expiresInMinutes > 1 ? 's' : ''}`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              ${this.logoUrl ? `<img src="${this.logoUrl}" alt="${this.appName}" style="height: 40px; margin-bottom: 20px;">` : ''}
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">
                Verify your email
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                ${greeting}
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Thanks for signing up for ${this.appName}! Please verify your email address by clicking the button below:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.verifyUrl}" 
                   style="display: inline-block; padding: 14px 32px; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);">
                  Verify Email
                </a>
              </div>
              
              <p style="margin: 20px 0; font-size: 14px; color: #71717a;">
                This link will expire in <strong>${expiresText}</strong>.
              </p>
              
              <p style="margin: 20px 0 0; font-size: 14px; color: #71717a;">
                If you didn't create an account on ${this.appName}, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 10px 0 0; font-size: 12px; color: ${this.primaryColor}; text-align: center; word-break: break-all;">
                ${data.verifyUrl}
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
   * Render email verification email plain text
   */
  private renderEmailVerificationEmailText(data: {
    email: string;
    name?: string;
    verifyUrl: string;
    expiresInMinutes: number;
  }): string {
    const greeting = data.name ? `Hi ${data.name},` : 'Hi,';
    const expiresText = data.expiresInMinutes >= 60
      ? `${Math.floor(data.expiresInMinutes / 60)} hour${Math.floor(data.expiresInMinutes / 60) > 1 ? 's' : ''}`
      : `${data.expiresInMinutes} minute${data.expiresInMinutes > 1 ? 's' : ''}`;

    return `${greeting}

Thanks for signing up for ${this.appName}! Please verify your email address by clicking the link below:

${data.verifyUrl}

This link will expire in ${expiresText}.

If you didn't create an account on ${this.appName}, you can safely ignore this email.
`;
  }

  /**
   * Render welcome email HTML
   */
  private renderWelcomeEmail(data: {
    email: string;
    name?: string;
    username: string;
  }): string {
    const greeting = data.name ? `Hi ${data.name},` : 'Hi,';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${this.appName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              ${this.logoUrl ? `<img src="${this.logoUrl}" alt="${this.appName}" style="height: 40px; margin-bottom: 20px;">` : ''}
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">
                Welcome to ${this.appName}!
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                ${greeting}
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Your account <strong>@${data.username}</strong> has been created successfully. You're all set to start collaborating on code!
              </p>
              
              <div style="margin: 30px 0; padding: 20px; background-color: #f4f4f5; border-radius: 8px;">
                <h3 style="margin: 0 0 16px; font-size: 14px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">
                  Getting Started
                </h3>
                <ul style="margin: 0; padding: 0 0 0 20px; font-size: 14px; line-height: 1.8; color: #52525b;">
                  <li>Create your first repository</li>
                  <li>Set up SSH keys for secure Git access</li>
                  <li>Explore public repositories</li>
                  <li>Invite collaborators to your projects</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${this.appUrl}/${data.username}" 
                   style="display: inline-block; padding: 14px 32px; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);">
                  Go to your profile
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                You're receiving this email because you signed up for ${this.appName}.
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
   * Render welcome email plain text
   */
  private renderWelcomeEmailText(data: {
    email: string;
    name?: string;
    username: string;
  }): string {
    const greeting = data.name ? `Hi ${data.name},` : 'Hi,';

    return `${greeting}

Welcome to ${this.appName}!

Your account @${data.username} has been created successfully. You're all set to start collaborating on code!

Getting Started:
- Create your first repository
- Set up SSH keys for secure Git access
- Explore public repositories
- Invite collaborators to your projects

Visit your profile: ${this.appUrl}/${data.username}

You're receiving this email because you signed up for ${this.appName}.
`;
  }

  /**
   * Render notification email HTML
   */
  private renderNotificationEmail(data: {
    email: string;
    name?: string;
    notifications: Array<{
      type: string;
      title: string;
      body?: string;
      url?: string;
      actorName?: string;
    }>;
  }): string {
    const greeting = data.name ? `Hi ${data.name},` : 'Hi,';
    
    const notificationHtml = data.notifications.map(n => `
      <div style="margin: 16px 0; padding: 16px; background-color: #f4f4f5; border-radius: 8px; border-left: 4px solid ${this.primaryColor};">
        <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #18181b;">
          ${n.title}
        </p>
        ${n.body ? `<p style="margin: 0 0 8px; font-size: 14px; color: #52525b;">${n.body}</p>` : ''}
        ${n.actorName ? `<p style="margin: 0; font-size: 12px; color: #71717a;">by ${n.actorName}</p>` : ''}
        ${n.url ? `<a href="${this.appUrl}${n.url}" style="display: inline-block; margin-top: 8px; font-size: 14px; color: ${this.primaryColor}; text-decoration: none;">View details &rarr;</a>` : ''}
      </div>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New notifications</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              ${this.logoUrl ? `<img src="${this.logoUrl}" alt="${this.appName}" style="height: 40px; margin-bottom: 20px;">` : ''}
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">
                ${data.notifications.length === 1 ? 'New notification' : `${data.notifications.length} new notifications`}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                ${greeting}
              </p>
              
              ${notificationHtml}
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${this.appUrl}/inbox" 
                   style="display: inline-block; padding: 14px 32px; background-color: ${this.primaryColor}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);">
                  View all notifications
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                <a href="${this.appUrl}/settings/notifications" style="color: ${this.primaryColor}; text-decoration: none;">Manage notification preferences</a>
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
   * Render notification email plain text
   */
  private renderNotificationEmailText(data: {
    email: string;
    name?: string;
    notifications: Array<{
      type: string;
      title: string;
      body?: string;
      url?: string;
      actorName?: string;
    }>;
  }): string {
    const greeting = data.name ? `Hi ${data.name},` : 'Hi,';
    
    const notificationText = data.notifications.map(n => {
      let text = `- ${n.title}`;
      if (n.body) text += `\n  ${n.body}`;
      if (n.actorName) text += `\n  by ${n.actorName}`;
      if (n.url) text += `\n  ${this.appUrl}${n.url}`;
      return text;
    }).join('\n\n');

    return `${greeting}

You have ${data.notifications.length} new notification${data.notifications.length > 1 ? 's' : ''}:

${notificationText}

View all notifications: ${this.appUrl}/inbox

To manage your notification preferences, visit: ${this.appUrl}/settings/notifications
`;
  }
}

/**
 * Singleton global email service instance
 */
let globalEmailServiceInstance: GlobalEmailService | null = null;

/**
 * Get or create the global email service
 */
export function getGlobalEmailService(): GlobalEmailService {
  if (!globalEmailServiceInstance) {
    globalEmailServiceInstance = new GlobalEmailService({
      apiKey: process.env.RESEND_API_KEY || '',
      fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@wit.dev',
      fromName: process.env.EMAIL_FROM_NAME || 'wit',
      appUrl: process.env.APP_URL || process.env.AUTH_BASE_URL || 'http://localhost:5173',
      appName: 'wit',
    });
  }
  return globalEmailServiceInstance;
}

/**
 * Reset the global email service (for testing)
 */
export function resetGlobalEmailService(): void {
  globalEmailServiceInstance = null;
}
