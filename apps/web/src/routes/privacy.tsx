import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrivacyPage() {
  return (
    <div className="container max-w-4xl py-12">
      <Button variant="ghost" asChild className="mb-6">
        <Link to="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to home
        </Link>
      </Button>

      <div className="prose prose-invert max-w-none">
        <h1>Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <h2>1. Information We Collect</h2>
        <p>
          We collect information that you provide directly to us, including when you create an account, use our services,
          or communicate with us.
        </p>

        <h3>Personal Information</h3>
        <ul>
          <li>Name and username</li>
          <li>Email address</li>
          <li>Profile information (bio, avatar, location)</li>
          <li>Repository and code data</li>
          <li>SSH keys and access tokens</li>
        </ul>

        <h3>Usage Information</h3>
        <ul>
          <li>Log data (IP address, browser type, pages visited)</li>
          <li>Device information</li>
          <li>Cookies and similar technologies</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide, maintain, and improve our services</li>
          <li>Process transactions and send related information</li>
          <li>Send technical notices, updates, and support messages</li>
          <li>Respond to your comments and questions</li>
          <li>Monitor and analyze trends, usage, and activities</li>
          <li>Detect, prevent, and address technical issues and security threats</li>
        </ul>

        <h2>3. Information Sharing</h2>
        <p>
          We do not sell your personal information. We may share your information in the following circumstances:
        </p>
        <ul>
          <li>With your consent or at your direction</li>
          <li>With service providers who perform services on our behalf</li>
          <li>To comply with legal obligations</li>
          <li>To protect the rights and safety of Wit, our users, and others</li>
          <li>In connection with a merger, sale, or acquisition</li>
        </ul>

        <h2>4. Data Security</h2>
        <p>
          We implement appropriate technical and organizational measures to protect your personal information against
          unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet
          or electronic storage is 100% secure.
        </p>

        <h2>5. Data Retention</h2>
        <p>
          We retain your personal information for as long as necessary to provide our services and fulfill the purposes
          outlined in this Privacy Policy, unless a longer retention period is required by law.
        </p>

        <h2>6. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access and receive a copy of your personal information</li>
          <li>Correct inaccurate or incomplete information</li>
          <li>Request deletion of your personal information</li>
          <li>Object to or restrict processing of your information</li>
          <li>Export your data in a portable format</li>
          <li>Withdraw consent at any time</li>
        </ul>

        <h2>7. Cookies</h2>
        <p>
          We use cookies and similar tracking technologies to track activity on our Service and hold certain information.
          You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.
        </p>

        <h2>8. Third-Party Services</h2>
        <p>
          Our Service may contain links to third-party websites or services that are not owned or controlled by wit.
          We have no control over and assume no responsibility for the content, privacy policies, or practices of any
          third-party sites or services.
        </p>

        <h2>9. Children's Privacy</h2>
        <p>
          Our Service is not intended for children under 13 years of age. We do not knowingly collect personal information
          from children under 13. If you are a parent or guardian and believe your child has provided us with personal
          information, please contact us.
        </p>

        <h2>10. International Data Transfers</h2>
        <p>
          Your information may be transferred to and maintained on computers located outside of your state, province,
          country, or other governmental jurisdiction where data protection laws may differ.
        </p>

        <h2>11. Changes to This Policy</h2>
        <p>
          We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new
          Privacy Policy on this page and updating the "Last updated" date.
        </p>

        <h2>12. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, please contact us at{' '}
          <a href="mailto:privacy@wit.sh" className="text-primary hover:underline">
            privacy@wit.sh
          </a>
        </p>
      </div>
    </div>
  );
}
