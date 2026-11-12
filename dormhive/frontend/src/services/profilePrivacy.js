const PROFILE_DETAIL_SELECTOR = 'input[name="first_name"], input[name="last_name"], input[name="email"], input[name="phone"]';

function maskValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const firstCharacter = Array.from(text)[0];
  if (firstCharacter === '+') return `+${Array.from(text)[1] ?? ''}••••••`;
  return `${firstCharacter}••••••`;
}

function createRevealButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'profile-detail-toggle';
  button.textContent = 'Reveal';
  button.setAttribute('aria-expanded', 'false');
  return button;
}

export function setupProfilePrivacy(form, profileName) {
  const entries = [];
  let editing = false;

  form.querySelectorAll(PROFILE_DETAIL_SELECTOR).forEach((input) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'profile-private-value';
    input.before(wrapper);
    wrapper.append(input);
    const button = createRevealButton();
    wrapper.append(button);
    entries.push({ element: input, button, original: input.value, isInput: true, revealed: false });
  });

  if (profileName) {
    const wrapper = document.createElement('div');
    wrapper.className = 'profile-private-display';
    profileName.before(wrapper);
    wrapper.append(profileName);
    const button = createRevealButton();
    wrapper.append(button);
    entries.push({ element: profileName, button, original: profileName.textContent, isInput: false, revealed: false });
  }

  const renderEntry = (entry) => {
    const visibleValue = editing || entry.revealed ? entry.original : maskValue(entry.original);
    if (entry.isInput) entry.element.value = visibleValue;
    else entry.element.textContent = visibleValue;
    entry.button.hidden = editing || !entry.original;
    entry.button.textContent = entry.revealed ? 'Hide' : 'Reveal';
    entry.button.setAttribute('aria-expanded', String(entry.revealed));
    entry.button.setAttribute('aria-label', `${entry.revealed ? 'Hide' : 'Reveal'} ${entry.isInput ? entry.element.name.replace('_', ' ') : 'profile name'}`);
  };

  entries.forEach((entry) => {
    entry.button.addEventListener('click', () => {
      entry.revealed = !entry.revealed;
      renderEntry(entry);
    });
    renderEntry(entry);
  });

  return {
    setEditing(enabled) {
      if (editing && !enabled) {
        entries.forEach((entry) => {
          entry.original = entry.isInput ? entry.element.value : entry.element.textContent;
          entry.revealed = false;
        });
      }
      editing = enabled;
      entries.forEach(renderEntry);
    }
  };
}
