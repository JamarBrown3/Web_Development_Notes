// Adds a Copy button to every code block on the page.
// The line numbers come from CSS, so they are never included in what gets copied.

// Each line of code lives in its own span, so join them back together.
function getCode(block) {
    const lines = block.querySelectorAll('span');

    return Array.from(lines).map((line) => line.textContent).join('\n') + '\n';
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Pages opened straight from a folder can block the clipboard API,
        // so fall back to selecting a hidden text box.
        const box = document.createElement('textarea');
        box.value = text;
        box.style.position = 'fixed';
        box.style.opacity = '0';
        document.body.appendChild(box);
        box.select();
        const copied = document.execCommand('copy');
        box.remove();
        return copied;
    }
}

function addCopyButton(block) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn';
    button.textContent = 'Copy';

    button.addEventListener('click', async () => {
        const copied = await copyToClipboard(getCode(block));
        button.textContent = copied ? 'Copied!' : 'Press Cmd+C';
        setTimeout(() => {
            button.textContent = 'Copy';
        }, 1500);
    });

    block.appendChild(button);
}

document.querySelectorAll('pre').forEach(addCopyButton);
