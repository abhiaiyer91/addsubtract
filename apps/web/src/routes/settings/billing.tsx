import { useState } from 'react';
import {
  CreditCard,
  Zap,
  Check,
  Loader2,
  TrendingUp,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Users,
  Building2,
  Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

// Plan icons mapping
const PLAN_ICONS = {
  free: Zap,
  pro: Sparkles,
  team: Users,
  enterprise: Building2,
};

// Plan colors
const PLAN_COLORS = {
  free: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  pro: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  team: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  enterprise: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

export function BillingPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const authenticated = !!session?.user;
  const [upgrading, setUpgrading] = useState<string | null>(null);

  // Get subscription data
  const { data: subscription, isLoading: subLoading } = trpc.billing.getSubscription.useQuery(
    undefined,
    { enabled: authenticated }
  );

  // Get usage data
  const { data: usage, isLoading: usageLoading } = trpc.billing.getUsage.useQuery(
    undefined,
    { enabled: authenticated }
  );

  // Get available plans
  const { data: plans, isLoading: plansLoading } = trpc.billing.getPlans.useQuery(
    undefined,
    { enabled: authenticated }
  );

  // Checkout mutation
  const checkoutMutation = trpc.billing.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else if (data.manualPayment) {
        // Show manual payment message
        alert(data.message);
      }
      setUpgrading(null);
    },
    onError: (error) => {
      alert(error.message);
      setUpgrading(null);
    },
  });

  // Portal mutation
  const portalMutation = trpc.billing.getPortalUrl.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.message);
      }
    },
  });

  const handleUpgrade = (productId: 'pro' | 'team') => {
    setUpgrading(productId);
    checkoutMutation.mutate({ productId });
  };

  const handleManageSubscription = () => {
    portalMutation.mutate();
  };

  if (sessionPending || subLoading || usageLoading) {
    return <Loading />;
  }

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              Please sign in to view your billing settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href="/login">Sign In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentTier = subscription?.tier || 'free';
  const TierIcon = PLAN_ICONS[currentTier as keyof typeof PLAN_ICONS] || Zap;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and view usage.
        </p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${PLAN_COLORS[currentTier as keyof typeof PLAN_COLORS]}`}>
                <TierIcon className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-xl">
                  {subscription?.tierDisplay || 'Free Plan'}
                </CardTitle>
                <CardDescription>
                  {currentTier === 'free' 
                    ? 'Basic features with usage limits' 
                    : 'Unlimited AI features'}
                </CardDescription>
              </div>
            </div>
            {currentTier !== 'free' && (
              <Button variant="outline" onClick={handleManageSubscription}>
                <CreditCard className="w-4 h-4 mr-2" />
                Manage Subscription
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Usage Section */}
      {usage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              This Month's Usage
            </CardTitle>
            <CardDescription>
              {new Date(usage.periodStart).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {usage.features.map((feature) => {
              const percentage = feature.unlimited 
                ? 0 
                : Math.min(100, (feature.current / feature.limit) * 100);
              const isNearLimit = !feature.unlimited && percentage > 80;
              const isAtLimit = !feature.unlimited && percentage >= 100;
              
              return (
                <div key={feature.feature} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{feature.label}</span>
                      {feature.unlimited && (
                        <Badge variant="secondary" className="text-xs">
                          Unlimited
                        </Badge>
                      )}
                    </div>
                    <span className={`text-sm ${isAtLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {feature.unlimited 
                        ? `${feature.current} used`
                        : `${feature.current} / ${feature.limit}`
                      }
                    </span>
                  </div>
                  {!feature.unlimited && (
                    <Progress 
                      value={percentage} 
                      className={isAtLimit ? 'bg-destructive/20' : isNearLimit ? 'bg-amber-100' : ''} 
                    />
                  )}
                  {isAtLimit && (
                    <p className="text-xs text-destructive">
                      You've reached your limit. Upgrade for unlimited access.
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Upgrade Alert for Free Users */}
      {currentTier === 'free' && (
        <Alert>
          <Crown className="h-4 w-4" />
          <AlertTitle>Upgrade to Pro</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Get unlimited AI features and priority support for $15/month.</span>
            <Button size="sm" onClick={() => handleUpgrade('pro')}>
              Upgrade Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Plans Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plansLoading ? (
            <Loading />
          ) : plans?.map((plan) => {
            const PlanIcon = PLAN_ICONS[plan.tier as keyof typeof PLAN_ICONS] || Zap;
            const isCurrentPlan = plan.current;
            const canUpgrade = !isCurrentPlan && !plan.contactSales && plan.tier !== 'free';
            
            return (
              <Card 
                key={plan.id} 
                className={`relative ${isCurrentPlan ? 'border-primary ring-1 ring-primary' : ''} ${plan.recommended ? 'border-purple-400' : ''}`}
              >
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-purple-600 text-white">Recommended</Badge>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="default">Current Plan</Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <div className={`mx-auto p-3 rounded-full w-fit ${PLAN_COLORS[plan.tier as keyof typeof PLAN_COLORS]}`}>
                    <PlanIcon className="w-6 h-6" />
                  </div>
                  <CardTitle className="mt-2">{plan.name}</CardTitle>
                  <div className="mt-2">
                    {plan.monthlyPrice === null ? (
                      <span className="text-2xl font-bold">Custom</span>
                    ) : plan.monthlyPrice === 0 ? (
                      <span className="text-2xl font-bold">Free</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">${plan.monthlyPrice}</span>
                        <span className="text-muted-foreground">/{plan.perUser ? 'user/' : ''}mo</span>
                      </>
                    )}
                  </div>
                  <CardDescription className="mt-2">
                    {plan.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-4">
                    {isCurrentPlan ? (
                      <Button variant="outline" className="w-full" disabled>
                        Current Plan
                      </Button>
                    ) : plan.contactSales ? (
                      <Button variant="outline" className="w-full" asChild>
                        <a href="mailto:sales@wit.sh">
                          Contact Sales
                          <ExternalLink className="w-4 h-4 ml-2" />
                        </a>
                      </Button>
                    ) : canUpgrade ? (
                      <Button 
                        className="w-full" 
                        onClick={() => handleUpgrade(plan.tier as 'pro' | 'team')}
                        disabled={upgrading === plan.tier}
                      >
                        {upgrading === plan.tier ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>Upgrade to {plan.name}</>
                        )}
                      </Button>
                    ) : (
                      <Button variant="ghost" className="w-full" disabled>
                        Free Forever
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium">What happens when I reach my usage limit?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You'll see a prompt to upgrade to Pro. Your existing data and repositories are never affected.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Can I cancel anytime?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Yes! You can cancel your subscription at any time. You'll keep access until the end of your billing period.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Do you offer annual billing?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Yes, annual billing is available at a 17% discount (2 months free). Contact us to switch.
            </p>
          </div>
          <div>
            <h3 className="font-medium">What payment methods do you accept?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              We accept all major credit cards, debit cards, and in some regions, local payment methods.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default BillingPage;
