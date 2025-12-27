import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TermsPage() {
  return (
    <div className="container max-w-4xl py-12">
      <Button variant="ghost" asChild className="mb-6">
        <Link to="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to home
        </Link>
      </Button>

      <div className="prose prose-invert max-w-none">
        <h1>Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing and using Wit, you accept and agree to be bound by the terms and provision of this agreement.
        </p>

        <h2>2. Use License</h2>
        <p>
          Permission is granted to temporarily download one copy of Wit for personal, non-commercial transitory viewing only.
          This is the grant of a license, not a transfer of title, and under this license you may not:
        </p>
        <ul>
          <li>Modify or copy the materials</li>
          <li>Use the materials for any commercial purpose or for any public display</li>
          <li>Attempt to reverse engineer any software contained in Wit</li>
          <li>Remove any copyright or other proprietary notations from the materials</li>
        </ul>

        <h2>3. User Accounts</h2>
        <p>
          When you create an account with us, you must provide accurate, complete, and current information at all times.
          Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account.
        </p>

        <h2>4. Content</h2>
        <p>
          Our Service allows you to post, link, store, share and otherwise make available certain information, text, graphics,
          or other material. You are responsible for the content that you post on or through the Service.
        </p>

        <h2>5. Prohibited Uses</h2>
        <p>You may not use Wit:</p>
        <ul>
          <li>In any way that violates any applicable national or international law or regulation</li>
          <li>To transmit, or procure the sending of, any advertising or promotional material without our prior written consent</li>
          <li>To impersonate or attempt to impersonate the Company, a Company employee, another user, or any other person or entity</li>
          <li>In any way that infringes upon the rights of others, or in any way is illegal, threatening, fraudulent, or harmful</li>
        </ul>

        <h2>6. Intellectual Property</h2>
        <p>
          The Service and its original content, features, and functionality are and will remain the exclusive property of Wit
          and its licensors. The Service is protected by copyright, trademark, and other laws.
        </p>

        <h2>7. Termination</h2>
        <p>
          We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability,
          under our sole discretion, for any reason whatsoever and without limitation.
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          In no event shall Wit, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any
          indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data,
          use, goodwill, or other intangible losses.
        </p>

        <h2>9. Changes to Terms</h2>
        <p>
          We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least
          30 days' notice prior to any new terms taking effect.
        </p>

        <h2>10. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at{' '}
          <a href="mailto:legal@wit.dev" className="text-primary hover:underline">
            legal@wit.dev
          </a>
        </p>
      </div>
    </div>
  );
}
