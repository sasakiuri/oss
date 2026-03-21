// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SplashScreen } from '@/renderer/presentation/screens/SplashScreen';

const TEST_VERSION = '0.1.0';

describe('SplashScreen', () => {
  describe('basic rendering', () => {
    it('renders SplashScreen correctly', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      // Application name is displayed
      expect(screen.getByText('SAIKA LANE')).toBeInTheDocument();
    });

    it('displays the application description', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      expect(screen.getByText('Electronic Target System')).toBeInTheDocument();
    });

    it('displays the loading message', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('displays the specified version', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      expect(screen.getByText(`Version ${TEST_VERSION}`)).toBeInTheDocument();
    });
  });

  describe('version display', () => {
    it('can specify a custom version', () => {
      render(<SplashScreen version="2.0.0" />);

      expect(screen.getByText('Version 2.0.0')).toBeInTheDocument();
    });

    it('displays correctly even with an empty version string', () => {
      render(<SplashScreen version="" />);

      expect(screen.getByText('Version')).toBeInTheDocument();
    });
  });

  describe('custom className', () => {
    it('applies a custom className', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} className="custom-class" />);

      const splashScreen = container.firstChild as HTMLElement;
      expect(splashScreen).toHaveClass('custom-class');
    });

    it('coexists default classes with custom class', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} className="custom-class" />);

      const splashScreen = container.firstChild as HTMLElement;
      expect(splashScreen).toHaveClass('custom-class');
      expect(splashScreen).toHaveClass('flex');
      expect(splashScreen).toHaveClass('flex-col');
      expect(splashScreen).toHaveClass('items-center');
      expect(splashScreen).toHaveClass('justify-center');
      expect(splashScreen).toHaveClass('h-screen');
      expect(splashScreen).toHaveClass('bg-vscode-bg');
    });

    it('works correctly even when className is an empty string', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} className="" />);

      const splashScreen = container.firstChild as HTMLElement;
      expect(splashScreen).toHaveClass('flex');
      // Default classes exist even with an empty className
      expect(splashScreen.className).not.toContain('undefined');
      expect(splashScreen.className).not.toContain('null');
    });
  });

  describe('layout', () => {
    it('has centered layout classes', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      const splashScreen = container.firstChild as HTMLElement;
      expect(splashScreen).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'h-screen');
    });

    it('has a background color conforming to the VSCode theme', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      const splashScreen = container.firstChild as HTMLElement;
      expect(splashScreen).toHaveClass('bg-vscode-bg');
    });
  });

  describe('animation elements', () => {
    it('has 3 loading dots', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      const dots = container.querySelectorAll('.animate-pulse');
      expect(dots.length).toBe(3);
    });

    it('each dot has an appropriate animation delay', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      const dots = container.querySelectorAll('.animate-pulse');
      expect(dots[0]).not.toHaveStyle({ animationDelay: '0.2s' });
      expect(dots[1]).toHaveStyle({ animationDelay: '0.2s' });
      expect(dots[2]).toHaveStyle({ animationDelay: '0.4s' });
    });

    it('loading dots are circular', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      const dots = container.querySelectorAll('.animate-pulse');
      dots.forEach((dot) => {
        expect(dot).toHaveClass('rounded-full');
      });
    });

    it('loading dots have appropriate size', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      const dots = container.querySelectorAll('.animate-pulse');
      dots.forEach((dot) => {
        expect(dot).toHaveClass('w-3', 'h-3');
      });
    });
  });

  describe('version info placement', () => {
    it('version info is absolutely positioned at the bottom', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      const versionContainer = container.querySelector('.absolute.bottom-8');
      expect(versionContainer).toBeInTheDocument();
    });

    it('version info has appropriate styles', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      const versionText = screen.getByText(/Version/);
      expect(versionText).toHaveClass('text-vscode-text-muted', 'text-sm');
    });
  });

  describe('text styles', () => {
    it('application name is large and bold', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      const appName = screen.getByText('SAIKA LANE');
      expect(appName).toHaveClass('text-6xl', 'font-bold', 'text-vscode-primary');
    });

    it('description has appropriate styles', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      const description = screen.getByText('Electronic Target System');
      expect(description).toHaveClass('text-vscode-text-muted', 'text-lg');
    });

    it('loading message has appropriate styles', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      const loadingText = screen.getByText('Loading...');
      expect(loadingText).toHaveClass('text-vscode-text-muted', 'text-sm');
    });
  });

  describe('structure and semantics', () => {
    it('has appropriate HTML structure', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      // Top-level element is div
      expect(container.firstChild?.nodeName).toBe('DIV');
    });

    it('application name is an h1 element', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      const appName = screen.getByText('SAIKA LANE');
      expect(appName.nodeName).toBe('H1');
    });

    it('description is a p element', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      const description = screen.getByText('Electronic Target System');
      expect(description.nodeName).toBe('P');
    });
  });

  describe('spacing', () => {
    it('has appropriate margin between logo and loading', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      const logoContainer = container.querySelector('.gap-6.mb-8');
      expect(logoContainer).toBeInTheDocument();
    });

    it('loading elements have appropriate gap', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      const loadingContainer = container.querySelector('.gap-4');
      expect(loadingContainer).toBeInTheDocument();
    });

    it('loading dots have appropriate gap', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      const dotsContainer = container.querySelector('.gap-2');
      expect(dotsContainer).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('important text content exists', () => {
      render(<SplashScreen version={TEST_VERSION} />);

      // Screen readers can read the text
      expect(screen.getByText('SAIKA LANE')).toBeVisible();
      expect(screen.getByText('Electronic Target System')).toBeVisible();
      expect(screen.getByText('Loading...')).toBeVisible();
    });

    it('all main elements are visible', () => {
      const { container } = render(<SplashScreen version={TEST_VERSION} />);

      // Content is displayed (no display: none, etc.)
      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer).toBeVisible();
    });
  });

  describe('edge cases', () => {
    it('can render with all props specified', () => {
      expect(() => {
        render(<SplashScreen version="1.0.0" className="custom" />);
      }).not.toThrow();
    });

    it('displays correctly even with a very long version string', () => {
      const longVersion = '1.0.0-beta.1+build.12345678901234567890';
      render(<SplashScreen version={longVersion} />);

      expect(screen.getByText(`Version ${longVersion}`)).toBeInTheDocument();
    });

    it('displays correctly even with special characters in the version', () => {
      const specialVersion = '1.0.0-alpha+build.2024-01-15';
      render(<SplashScreen version={specialVersion} />);

      expect(screen.getByText(`Version ${specialVersion}`)).toBeInTheDocument();
    });
  });
});
