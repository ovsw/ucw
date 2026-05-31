# Deterministic-first retrieval prototype

Start the GuideSite prototype as a retrieval workbench that evaluates how well a **Prompt** can retrieve the right **Concerns** and **Content Entities** before building the full **Answer Assembly Process**. The fixture corpus should use Sanity-shaped documents with common `contentMap` and `relatedConcerns` fields, and the first retrieval strategy should be a weighted deterministic baseline over **Concerns**, **Content Maps**, titles, types, and selected fields.

This deliberately does not start with vector embeddings or LLM-only relevance screening. The workbench should support multiple retrieval strategies behind the same evaluation interface so embeddings, LLM Concern classification, or hybrid retrieval can be compared later against the deterministic baseline using curated gold-set **Parent Prompts**.
