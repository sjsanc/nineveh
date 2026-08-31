# Fixture provenance

`epub/sample.epub` is *Alice's Adventures in Wonderland* (Lewis Carroll),
downloaded from Project Gutenberg (ebook #11, "noimages" EPUB variant,
public domain in the US): https://www.gutenberg.org/ebooks/11

`mobi/sample.mobi`, `azw3/sample.azw3`, and `pdf/sample.pdf` are derived from
that same EPUB via `ebook-convert` (Calibre), so all four canonical fixtures
trace back to identical source content. To regenerate:

```
ebook-convert sample.epub sample.mobi
ebook-convert sample.epub sample.azw3
ebook-convert sample.epub sample.pdf
```

Do not add copyrighted or piracy-sourced files here. Stick to public domain
or permissively licensed text (Project Gutenberg, Standard Ebooks).
