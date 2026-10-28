import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { Markdown } from '../src/markdown/Markdown'

describe('Markdown Security & Sanitization', () => {
  it('strips script tags and onerror attributes from rendered output', () => {
    const malicious = `
# Safe Note

<script>window.monet.deleteNote('important')</script>

<img src="invalid-url" onerror="alert('XSS')" />

<a href="javascript:alert(1)">Click me</a>

Normal text continues.
`
    const html = renderToStaticMarkup(React.createElement(Markdown, { source: malicious }))

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('window.monet.deleteNote')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('Safe Note')
    expect(html).toContain('Normal text continues.')
  })
})
