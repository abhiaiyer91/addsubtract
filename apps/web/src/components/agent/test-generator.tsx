/**
 * AI Test Generator Component
 * 
 * Generates comprehensive tests for code using AI.
 * Features:
 * - Automatic test framework detection
 * - Multiple test types (unit, integration, e2e)
 * - Coverage analysis suggestions
 * - Test file creation
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  TestTube2,
  Play,
  FileCode,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Download,
  RefreshCw,
  Settings2,
  Beaker,
  Bug,
  Shield,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type TestFramework = 'vitest' | 'jest' | 'mocha' | 'playwright' | 'cypress';
export type TestType = 'unit' | 'integration' | 'e2e' | 'snapshot';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  code: string;
  type: TestType;
  status: 'pending' | 'running' | 'passed' | 'failed';
  duration?: number;
  error?: string;
}

export interface GeneratedTests {
  framework: TestFramework;
  filePath: string;
  sourceFilePath: string;
  imports: string;
  setup?: string;
  teardown?: string;
  tests: TestCase[];
  coverage: {
    functions: number;
    lines: number;
    branches: number;
  };
}

export interface TestGeneratorConfig {
  framework: TestFramework;
  includeEdgeCases: boolean;
  includeErrorCases: boolean;
  includePerformanceTests: boolean;
  mockExternals: boolean;
  useTypeScript: boolean;
  testTypes: TestType[];
}

const DEFAULT_CONFIG: TestGeneratorConfig = {
  framework: 'vitest',
  includeEdgeCases: true,
  includeErrorCases: true,
  includePerformanceTests: false,
  mockExternals: true,
  useTypeScript: true,
  testTypes: ['unit'],
};

const FRAMEWORK_OPTIONS: { value: TestFramework; label: string; icon: React.ReactNode }[] = [
  { value: 'vitest', label: 'Vitest', icon: <Zap className="h-4 w-4 text-yellow-500" /> },
  { value: 'jest', label: 'Jest', icon: <TestTube2 className="h-4 w-4 text-red-500" /> },
  { value: 'mocha', label: 'Mocha', icon: <Beaker className="h-4 w-4 text-amber-600" /> },
  { value: 'playwright', label: 'Playwright', icon: <Shield className="h-4 w-4 text-green-500" /> },
  { value: 'cypress', label: 'Cypress', icon: <Bug className="h-4 w-4 text-cyan-500" /> },
];

const TEST_TYPE_OPTIONS: { value: TestType; label: string; description: string }[] = [
  { value: 'unit', label: 'Unit', description: 'Test individual functions/components' },
  { value: 'integration', label: 'Integration', description: 'Test how parts work together' },
  { value: 'e2e', label: 'E2E', description: 'Test complete user flows' },
  { value: 'snapshot', label: 'Snapshot', description: 'Capture and compare output' },
];

interface TestGeneratorProps {
  sourceCode: string;
  sourceFilePath: string;
  onGenerate: (config: TestGeneratorConfig) => Promise<GeneratedTests>;
  onRunTests: (tests: TestCase[]) => Promise<TestCase[]>;
  onSaveTests: (tests: GeneratedTests) => Promise<void>;
  className?: string;
}

export function TestGenerator({
  sourceCode,
  sourceFilePath,
  onGenerate,
  onRunTests,
  onSaveTests,
  className,
}: TestGeneratorProps) {
  const [config, setConfig] = useState<TestGeneratorConfig>(DEFAULT_CONFIG);
  const [generatedTests, setGeneratedTests] = useState<GeneratedTests | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const tests = await onGenerate(config);
      setGeneratedTests(tests);
      setActiveTab('preview');
    } catch (error) {
      console.error('Failed to generate tests:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [config, onGenerate]);

  const handleRunTests = useCallback(async () => {
    if (!generatedTests) return;
    
    setIsRunning(true);
    try {
      const results = await onRunTests(generatedTests.tests);
      setGeneratedTests(prev => prev ? {
        ...prev,
        tests: results,
      } : prev);
    } catch (error) {
      console.error('Failed to run tests:', error);
    } finally {
      setIsRunning(false);
    }
  }, [generatedTests, onRunTests]);

  const handleSave = useCallback(async () => {
    if (!generatedTests) return;
    
    setIsSaving(true);
    try {
      await onSaveTests(generatedTests);
    } catch (error) {
      console.error('Failed to save tests:', error);
    } finally {
      setIsSaving(false);
    }
  }, [generatedTests, onSaveTests]);

  const copyToClipboard = useCallback(() => {
    if (!generatedTests) return;
    
    const fullCode = [
      generatedTests.imports,
      generatedTests.setup || '',
      ...generatedTests.tests.map(t => t.code),
      generatedTests.teardown || '',
    ].filter(Boolean).join('\n\n');
    
    navigator.clipboard.writeText(fullCode);
  }, [generatedTests]);

  const updateConfig = <K extends keyof TestGeneratorConfig>(
    key: K,
    value: TestGeneratorConfig[K]
  ) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const toggleTestType = (type: TestType) => {
    setConfig(prev => ({
      ...prev,
      testTypes: prev.testTypes.includes(type)
        ? prev.testTypes.filter(t => t !== type)
        : [...prev.testTypes, type],
    }));
  };

  const passedTests = generatedTests?.tests.filter(t => t.status === 'passed').length || 0;
  const failedTests = generatedTests?.tests.filter(t => t.status === 'failed').length || 0;
  const totalTests = generatedTests?.tests.length || 0;

  return (
    <div className={cn('flex flex-col border rounded-lg bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <TestTube2 className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h3 className="font-semibold">AI Test Generator</h3>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
              {sourceFilePath}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowConfig(!showConfig)}
                >
                  <Settings2 className={cn(
                    'h-4 w-4',
                    showConfig && 'text-purple-500'
                  )} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Configure test generation</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            size="sm"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate Tests
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Configuration Panel */}
      {showConfig && (
        <div className="p-4 border-b bg-muted/30 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Framework Selection */}
            <div className="space-y-2">
              <Label>Test Framework</Label>
              <Select
                value={config.framework}
                onValueChange={(v) => updateConfig('framework', v as TestFramework)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRAMEWORK_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        {opt.icon}
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Test Types */}
            <div className="space-y-2">
              <Label>Test Types</Label>
              <div className="flex flex-wrap gap-1">
                {TEST_TYPE_OPTIONS.map(opt => (
                  <Badge
                    key={opt.value}
                    variant={config.testTypes.includes(opt.value) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleTestType(opt.value)}
                  >
                    {opt.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="edge-cases" className="cursor-pointer">Include edge cases</Label>
              <Switch
                id="edge-cases"
                checked={config.includeEdgeCases}
                onCheckedChange={(v) => updateConfig('includeEdgeCases', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="error-cases" className="cursor-pointer">Include error cases</Label>
              <Switch
                id="error-cases"
                checked={config.includeErrorCases}
                onCheckedChange={(v) => updateConfig('includeErrorCases', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="mock-externals" className="cursor-pointer">Mock external deps</Label>
              <Switch
                id="mock-externals"
                checked={config.mockExternals}
                onCheckedChange={(v) => updateConfig('mockExternals', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="perf-tests" className="cursor-pointer">Performance tests</Label>
              <Switch
                id="perf-tests"
                checked={config.includePerformanceTests}
                onCheckedChange={(v) => updateConfig('includePerformanceTests', v)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Generated Tests Content */}
      {generatedTests ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start rounded-none border-b px-4 h-10">
            <TabsTrigger value="preview" className="text-xs">
              Preview ({totalTests} tests)
            </TabsTrigger>
            <TabsTrigger value="code" className="text-xs">
              Code
            </TabsTrigger>
            <TabsTrigger value="coverage" className="text-xs">
              Coverage
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="flex-1 m-0">
            <ScrollArea className="h-[300px]">
              <div className="p-4 space-y-2">
                {/* Test Results Summary */}
                {(passedTests > 0 || failedTests > 0) && (
                  <div className="flex items-center gap-4 mb-4 p-2 rounded bg-muted">
                    <span className="flex items-center gap-1 text-sm text-green-500">
                      <CheckCircle2 className="h-4 w-4" />
                      {passedTests} passed
                    </span>
                    <span className="flex items-center gap-1 text-sm text-red-500">
                      <XCircle className="h-4 w-4" />
                      {failedTests} failed
                    </span>
                  </div>
                )}

                {/* Test List */}
                <Accordion type="multiple" className="space-y-2">
                  {generatedTests.tests.map((test, index) => (
                    <AccordionItem
                      key={test.id}
                      value={test.id}
                      className="border rounded-lg px-3"
                    >
                      <AccordionTrigger className="py-2 hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-xs text-muted-foreground w-6">
                            #{index + 1}
                          </span>
                          {test.status === 'running' ? (
                            <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                          ) : test.status === 'passed' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : test.status === 'failed' ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2" />
                          )}
                          <span className="text-sm font-medium text-left flex-1">
                            {test.name}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {test.type}
                          </Badge>
                          {test.duration && (
                            <span className="text-xs text-muted-foreground">
                              {test.duration}ms
                            </span>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          <p className="text-xs text-muted-foreground">
                            {test.description}
                          </p>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            <code>{test.code}</code>
                          </pre>
                          {test.error && (
                            <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded">
                              {test.error}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="code" className="flex-1 m-0">
            <ScrollArea className="h-[300px]">
              <pre className="p-4 text-xs font-mono">
                <code>
                  {generatedTests.imports}
                  {'\n\n'}
                  {generatedTests.setup && `${generatedTests.setup}\n\n`}
                  {generatedTests.tests.map(t => t.code).join('\n\n')}
                  {generatedTests.teardown && `\n\n${generatedTests.teardown}`}
                </code>
              </pre>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="coverage" className="flex-1 m-0">
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Functions</span>
                  <span className="font-medium">{generatedTests.coverage.functions}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${generatedTests.coverage.functions}%` }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Lines</span>
                  <span className="font-medium">{generatedTests.coverage.lines}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${generatedTests.coverage.lines}%` }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Branches</span>
                  <span className="font-medium">{generatedTests.coverage.branches}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500"
                    style={{ width: `${generatedTests.coverage.branches}%` }}
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
              <TestTube2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No tests generated yet</p>
              <p className="text-sm text-muted-foreground">
                Click &quot;Generate Tests&quot; to create tests for your code
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions Footer */}
      {generatedTests && (
        <div className="flex items-center justify-between p-4 border-t">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyToClipboard}>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunTests}
              disabled={isRunning}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Tests
            </Button>
          </div>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Save to {generatedTests.filePath}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook for test generation
 */
export function useTestGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTests, setGeneratedTests] = useState<GeneratedTests | null>(null);

  const generate = useCallback(async (
    sourceCode: string,
    sourceFilePath: string,
    config: TestGeneratorConfig
  ): Promise<GeneratedTests> => {
    setIsGenerating(true);
    
    try {
      // This would call the AI API in a real implementation
      // For now, we'll create a mock response
      const fileName = sourceFilePath.split('/').pop() || 'test';
      const testFileName = fileName.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1');
      
      const mockTests: GeneratedTests = {
        framework: config.framework,
        filePath: sourceFilePath.replace(fileName, testFileName),
        sourceFilePath,
        imports: `import { describe, it, expect${config.mockExternals ? ', vi' : ''} } from '${config.framework}';
import { /* exported functions */ } from './${fileName.replace(/\.(ts|tsx|js|jsx)$/, '')}';`,
        setup: config.mockExternals ? `beforeEach(() => {
  vi.clearAllMocks();
});` : undefined,
        tests: [
          {
            id: 'test-1',
            name: 'should handle basic input',
            description: 'Tests the function with standard input values',
            code: `it('should handle basic input', () => {
  const result = functionName('test');
  expect(result).toBeDefined();
});`,
            type: 'unit',
            status: 'pending',
          },
          ...(config.includeEdgeCases ? [{
            id: 'test-2',
            name: 'should handle empty input',
            description: 'Tests edge case with empty/null input',
            code: `it('should handle empty input', () => {
  const result = functionName('');
  expect(result).toBe('');
});`,
            type: 'unit' as TestType,
            status: 'pending' as const,
          }] : []),
          ...(config.includeErrorCases ? [{
            id: 'test-3',
            name: 'should throw on invalid input',
            description: 'Tests error handling with invalid input',
            code: `it('should throw on invalid input', () => {
  expect(() => functionName(null)).toThrow();
});`,
            type: 'unit' as TestType,
            status: 'pending' as const,
          }] : []),
        ],
        coverage: {
          functions: 85,
          lines: 78,
          branches: 65,
        },
      };
      
      setGeneratedTests(mockTests);
      return mockTests;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    isGenerating,
    generatedTests,
    generate,
    setGeneratedTests,
  };
}
