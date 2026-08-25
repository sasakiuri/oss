import { describe, it, expect, beforeEach } from 'vitest';
import { useNavigationStore } from '@/renderer/presentation/stores/ui/navigation.store';

describe('useNavigationStore', () => {
  beforeEach(() => {
    useNavigationStore.getState().setActiveScreen('control');
  });

  describe('initial state', () => {
    it('should have competition control as the default active screen', () => {
      expect(useNavigationStore.getInitialState().activeScreen).toBe('control');
    });
  });

  describe('setActiveScreen', () => {
    it('should set active screen to control', () => {
      useNavigationStore.getState().setActiveScreen('control');
      expect(useNavigationStore.getState().activeScreen).toBe('control');
    });

    it('should set active screen to settings', () => {
      useNavigationStore.getState().setActiveScreen('settings');
      expect(useNavigationStore.getState().activeScreen).toBe('settings');
    });

    it('should set active screen to tournament', () => {
      useNavigationStore.getState().setActiveScreen('settings');
      useNavigationStore.getState().setActiveScreen('tournament');
      expect(useNavigationStore.getState().activeScreen).toBe('tournament');
    });

    it('should replace previous screen', () => {
      useNavigationStore.getState().setActiveScreen('control');
      useNavigationStore.getState().setActiveScreen('settings');
      expect(useNavigationStore.getState().activeScreen).toBe('settings');
    });
  });
});
