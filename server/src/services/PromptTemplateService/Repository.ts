import type { PromptTemplateSummary, PromptTemplateRecord } from './types';
import { DEFAULT_VERSION } from './constant';
import fs from 'fs';
import path from 'path';

export class PromptTemplateRepository {

    constructor(private promptsBaseDir: string) {
    }

    listTemplates(language?: string): PromptTemplateSummary[] {
        const templates: PromptTemplateSummary[] = [];

        let languagesToScan: string[];
        if (language) {
            languagesToScan = [language];
        } else {
            if (!fs.existsSync(this.promptsBaseDir)) {
                return [];
            }
            languagesToScan = fs.readdirSync(this.promptsBaseDir).filter(dir => {
                const fullPath = path.join(this.promptsBaseDir, dir);
                return fs.statSync(fullPath).isDirectory();
            });
        }

        for (const lang of languagesToScan) {
            const langDir = path.join(this.promptsBaseDir, lang);

            if (!fs.existsSync(langDir)) {
                continue;
            }

            const files = fs.readdirSync(langDir).filter(file => file.endsWith('.md'));

            for (const file of files) {
                const filePath = path.join(langDir, file);
                const stats = fs.statSync(filePath);
                const content = fs.readFileSync(filePath, 'utf-8');
                const name = file.replace('.md', '');
                const id = `${name}_${lang}`.toLowerCase().replace(/\s+/g, '_');

                const lines = content.split('\n');
                let description: string | undefined;
                if (lines[0].startsWith('<!--') && lines[0].endsWith('-->')) {
                    description = lines[0].slice(4, -3).trim();
                }

                templates.push({
                    id,
                    name,
                    language: lang,
                    description,
                    version: DEFAULT_VERSION,
                    createdAt: stats.birthtime,
                    updatedAt: stats.mtime
                });
            }
        }

        templates.sort((a, b) => a.name.localeCompare(b.name));

        return templates;
    }

    getTemplate(name: string, language: string): PromptTemplateRecord {
        const filePath = path.join(this.promptsBaseDir, language, `${name}.md`);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Template not found: ${name}_${language}`);
        }

        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        const id = `${name}_${language}`.toLowerCase().replace(/\s+/g, '_');

        const lines = content.split('\n');
        let description: string | undefined;
        if (lines[0].startsWith('<!--')) {
            description = lines[0].replace('<!--','').replace('-->','');
        }

        return {
            id,
            name,
            language,
            content,
            description,
            version: DEFAULT_VERSION,
            createdAt: stats.birthtime,
            updatedAt: stats.mtime
        };
    }

    saveTemplate(name: string, language: string, content: string, description?: string): void {
        const langDir = path.join(this.promptsBaseDir, language);
        if (!fs.existsSync(langDir)) {
            fs.mkdirSync(langDir, { recursive: true });
        }

        const filePath = path.join(langDir, `${name}.md`);

        let fileContent = content;
        if (description) {
            fileContent = `<!-- ${description} -->\n${content}`;
        }

        fs.writeFileSync(filePath, fileContent, 'utf-8');
    }

    updateTemplate(name: string, language: string, content: string, description?: string): void {
        const filePath = path.join(this.promptsBaseDir, language, `${name}.md`);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Template not found: ${name}_${language}`);
        }

        const existingContent = fs.readFileSync(filePath, 'utf-8');
        const lines = existingContent.split('\n');

        let existingDescription: string | undefined;
        let contentStartIndex = 0;
        if (lines[0].startsWith('<!--') && lines[0].endsWith('-->')) {
            existingDescription = lines[0].slice(4, -3).trim();
            contentStartIndex = 1;
        }

        const existingContentBody = lines.slice(contentStartIndex).join('\n');

        const newDescription = description !== undefined ? description : existingDescription;
        const newContent = content !== undefined ? content : existingContentBody;

        let fileContent = newContent;
        if (newDescription) {
            fileContent = `<!-- ${newDescription} -->\n${newContent}`;
        }

        fs.writeFileSync(filePath, fileContent, 'utf-8');
    }

    deleteTemplate(name: string, language: string): void {
        const filePath = path.join(this.promptsBaseDir, language, `${name}.md`);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Template not found: ${name}_${language}`);
        }

        fs.unlinkSync(filePath);
    }
}
