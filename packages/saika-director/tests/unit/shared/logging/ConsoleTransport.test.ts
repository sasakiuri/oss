import { ConsoleTransport } from '@/shared/logging/ConsoleTransport';

describe('ConsoleTransport', () => {
  const transport = new ConsoleTransport();

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes DEBUG to console.debug', () => {
    transport.write('DEBUG', '[DEBUG] [Test] msg', []);
    expect(console.debug).toHaveBeenCalledWith('[DEBUG] [Test] msg');
  });

  it('routes INFO to console.info', () => {
    transport.write('INFO', '[INFO] [Test] msg', []);
    expect(console.info).toHaveBeenCalledWith('[INFO] [Test] msg');
  });

  it('routes WARN to console.warn', () => {
    transport.write('WARN', '[WARN] [Test] msg', []);
    expect(console.warn).toHaveBeenCalledWith('[WARN] [Test] msg');
  });

  it('routes ERROR to console.error', () => {
    transport.write('ERROR', '[ERROR] [Test] msg', []);
    expect(console.error).toHaveBeenCalledWith('[ERROR] [Test] msg');
  });

  it('passes extra args when present', () => {
    transport.write('INFO', '[INFO] [Test] msg', ['extra', 42]);
    expect(console.info).toHaveBeenCalledWith('[INFO] [Test] msg', 'extra', 42);
  });
});
