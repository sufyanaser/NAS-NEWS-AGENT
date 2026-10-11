/**
 * Secure Source Importer & HTML Text Extractor (Specs §9.2, §3.3).
 * Enforces HTTPS-only, SSRF host blocks, redirect limits, 8s timeout, and 2MB stream limit.
 */
import { LIMITS } from '../shared/contracts';
import type { ImportFailureClass, ImportResponse } from '../shared/contracts';

export const IMPORT_MESSAGES: Record<ImportFailureClass | 'success', string> = {
  success: 'تمت قراءة نص المادة بنجاح من المصدر.',
  network_error: 'تعذّر الوصول إلى الرابط. تحقق من الرابط أو تابع بلصق النص يدوياً.',
  blocked: 'هذا المصدر يمنع القراءة الآلية (مثل فيسبوك أو المواقع المحمية). يرجى لصق النص الأصلي يدوياً.',
  unsupported_content: 'تعذّرت قراءة محتوى هذا الرابط آلياً. يرجى لصق النص الأصلي يدوياً.',
  insufficient_extract: 'المادة المستخرَجة غير كافية للتحرير. يرجى لصق النص الأصلي يدوياً.',
};

/**
 * Validates a target URL against SSRF rules:
 * - Scheme MUST be https:
 * - No userinfo
 * - No private, loopback, link-local, or cloud metadata hostnames / IP addresses
 */
export function validateUrlForSsrf(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid_url_format' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'https_required' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'userinfo_not_allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Reject empty or obvious loopback / internal names
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.onion')) {
    return { ok: false, reason: 'blocked_internal_hostname' };
  }

  // IPv4 regex check
  const ipv4Regex = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
  const ipMatch = ipv4Regex.exec(hostname);
  if (ipMatch) {
    const p1 = parseInt(ipMatch[1] ?? '0', 10);
    const p2 = parseInt(ipMatch[2] ?? '0', 10);
    const p3 = parseInt(ipMatch[3] ?? '0', 10);
    const p4 = parseInt(ipMatch[4] ?? '0', 10);

    if (p1 > 255 || p2 > 255 || p3 > 255 || p4 > 255) {
      return { ok: false, reason: 'invalid_ip_range' };
    }

    // 0.0.0.0/8 (Broadcast/Current network)
    if (p1 === 0) return { ok: false, reason: 'blocked_ip_range' };
    // 127.0.0.0/8 (Loopback)
    if (p1 === 127) return { ok: false, reason: 'blocked_loopback_ip' };
    // 10.0.0.0/8 (Private)
    if (p1 === 10) return { ok: false, reason: 'blocked_private_ip' };
    // 172.16.0.0/12 (Private: 172.16 - 172.31)
    if (p1 === 172 && p2 >= 16 && p2 <= 31) return { ok: false, reason: 'blocked_private_ip' };
    // 192.168.0.0/16 (Private)
    if (p1 === 192 && p2 === 168) return { ok: false, reason: 'blocked_private_ip' };
    // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
    if (p1 === 169 && p2 === 254) return { ok: false, reason: 'blocked_metadata_ip' };
    // 100.64.0.0/10 (Carrier-grade NAT: 100.64 - 100.127)
    if (p1 === 100 && p2 >= 64 && p2 <= 127) return { ok: false, reason: 'blocked_cgnat_ip' };
    // 192.0.0.0/24, 192.0.2.0/24 (Documentation/Test-Net-1)
    if (p1 === 192 && p2 === 0 && (p3 === 0 || p3 === 2)) return { ok: false, reason: 'blocked_test_ip' };
    // 198.18.0.0/15 (Benchmarking: 198.18 - 198.19)
    if (p1 === 198 && (p2 === 18 || p2 === 19)) return { ok: false, reason: 'blocked_test_ip' };
    // 198.51.100.0/24 (Test-Net-2)
    if (p1 === 198 && p2 === 51 && p3 === 100) return { ok: false, reason: 'blocked_test_ip' };
    // 203.0.113.0/24 (Test-Net-3)
    if (p1 === 203 && p2 === 0 && p3 === 113) return { ok: false, reason: 'blocked_test_ip' };
    // 224.0.0.0/4 (Multicast: 224 - 239) & 240.0.0.0/4 (Reserved: 240 - 255)
    if (p1 >= 224) return { ok: false, reason: 'blocked_multicast_reserved_ip' };
  }

  // IPv6 check
  if (hostname.startsWith('[') || hostname.includes(':')) {
    // Loopback, unique local (fc00::/7), link-local (fe80::/10), IPv4-mapped
    const cleanIpv6 = hostname.replace(/^\[/, '').replace(/\]$/, '');
    if (cleanIpv6 === '::1' || cleanIpv6 === '::' || cleanIpv6.startsWith('fe80:') || cleanIpv6.startsWith('fc') || cleanIpv6.startsWith('fd') || cleanIpv6.includes('::ffff:')) {
      return { ok: false, reason: 'blocked_ipv6_reserved' };
    }
  }

  return { ok: true, url: parsed };
}

/**
 * Lightweight HTML to text extractor without external dependencies or JS execution.
 * Removes head, script, style, nav, footer, header, svg, noscript.
 * Prioritizes <article> content if available, falling back to <body>.
 */
export function extractArticleText(html: string): string {
  // Strip comments
  let clean = html.replace(/<!--[\s\S]*?-->/gi, '');

  // Strip non-content blocks: script, style, noscript, svg, nav, footer, header, aside
  clean = clean.replace(/<(script|style|noscript|svg|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  // Look for <article> block if present
  const articleMatch = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(clean);
  const targetArea = articleMatch ? (articleMatch[1] ?? clean) : clean;

  // Replace block elements with newlines to preserve readability
  let text = targetArea
    .replace(/<(br|p|div|h[1-6]|li|tr|blockquote|section)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '); // Strip all other tags

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  // Clean whitespace and normalize newlines
  const lines = text.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter((l) => l.length > 0);
  return lines.join('\n\n');
}

/**
 * Fetches the URL safely adhering to:
 * - Maximum 3 redirects followed manually
 * - SSRF re-check on each redirect target
 * - AbortController 8s timeout
 * - Max 2MB streamed body
 * - Content-Type validation
 */
export async function fetchAndExtractSource(
  targetUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<ImportResponse> {
  let currentUrl = targetUrl;
  let redirectsCount = 0;

  while (redirectsCount <= LIMITS.maxRedirects) {
    const ssrfCheck = validateUrlForSsrf(currentUrl);
    if (!ssrfCheck.ok) {
      return {
        ok: false,
        failureClass: 'blocked',
        importMessage: IMPORT_MESSAGES.blocked,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LIMITS.importTimeoutMs);

    let res: Response;
    try {
      res = await fetchFn(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'NAS-Newsroom/1.0 (Editorial; +https://nr.nasfm.info)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      // Timeout abort or network error
      return {
        ok: false,
        failureClass: 'network_error',
        importMessage: IMPORT_MESSAGES.network_error,
      };
    } finally {
      clearTimeout(timeout);
    }

    // Handle redirects manually
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      redirectsCount++;
      if (redirectsCount > LIMITS.maxRedirects) {
        return {
          ok: false,
          failureClass: 'network_error',
          importMessage: IMPORT_MESSAGES.network_error,
        };
      }

      const location = res.headers.get('Location');
      if (!location) {
        return {
          ok: false,
          failureClass: 'network_error',
          importMessage: IMPORT_MESSAGES.network_error,
        };
      }

      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return {
          ok: false,
          failureClass: 'network_error',
          importMessage: IMPORT_MESSAGES.network_error,
        };
      }
      continue;
    }

    // Status code checks
    if (res.status === 403 || res.status === 429) {
      return {
        ok: false,
        failureClass: 'blocked',
        importMessage: IMPORT_MESSAGES.blocked,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        failureClass: 'network_error',
        importMessage: IMPORT_MESSAGES.network_error,
      };
    }

    // Check Content-Type
    const contentType = (res.headers.get('Content-Type') ?? '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return {
        ok: false,
        failureClass: 'unsupported_content',
        importMessage: IMPORT_MESSAGES.unsupported_content,
      };
    }

    // Read stream up to 2MB (LIMITS.maxImportBytes)
    const reader = res.body?.getReader();
    if (!reader) {
      return {
        ok: false,
        failureClass: 'unsupported_content',
        importMessage: IMPORT_MESSAGES.unsupported_content,
      };
    }

    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    let exceeded = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          bytesRead += value.length;
          if (bytesRead > LIMITS.maxImportBytes) {
            exceeded = true;
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
    } catch {
      return {
        ok: false,
        failureClass: 'network_error',
        importMessage: IMPORT_MESSAGES.network_error,
      };
    }

    if (exceeded) {
      return {
        ok: false,
        failureClass: 'unsupported_content',
        importMessage: IMPORT_MESSAGES.unsupported_content,
      };
    }

    // Concatenate chunks and decode text
    const totalBuffer = new Uint8Array(bytesRead);
    let offset = 0;
    for (const c of chunks) {
      totalBuffer.set(c, offset);
      offset += c.length;
    }
    const html = new TextDecoder('utf-8').decode(totalBuffer);

    // Extract text from HTML
    const extractedText = extractArticleText(html);

    if (extractedText.length < LIMITS.minExtractedChars) {
      return {
        ok: false,
        failureClass: 'insufficient_extract',
        importMessage: IMPORT_MESSAGES.insufficient_extract,
      };
    }

    return {
      ok: true,
      sourceText: extractedText,
      importMessage: IMPORT_MESSAGES.success,
    };
  }

  return {
    ok: false,
    failureClass: 'network_error',
    importMessage: IMPORT_MESSAGES.network_error,
  };
}
