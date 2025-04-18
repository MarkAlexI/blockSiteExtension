import { customAlert } from './scripts/customAlert.js';
import { isValidURL } from './scripts/isValidURL.js';
import { isValidAscii } from './scripts/isValidAscii.js';
import { isOnlyLowerCase } from './scripts/isOnlyLowerCase.js';

const donateSpan = document.getElementById('donate-text');
const donateSpanText = chrome.i18n.getMessage('donatespantext');
if (donateSpanText) {
  donateSpan.innerText = donateSpanText;
}

const donateButton = document.getElementById('donate-button');
const donateURL = 'https://revolut.me/markalexi';
const donateBtnText = chrome.i18n.getMessage('donatebtntext');
if (donateBtnText) {
  donateButton.innerText = donateBtnText;
}

donateButton.addEventListener('click', (e) => {
  e.stopPropagation();
  window.open(donateURL, '_blank');
});

const rulesContainer = document.getElementById('rules-container');
const addRuleButton = document.getElementById('add-rule');
const statusOutput = document.getElementById('status');

const wrongRedirectUrl = chrome.i18n.getMessage('wrongredirecturl');
const blockUrlOnlyAscii = chrome.i18n.getMessage('blockurlonlyascii');
const blockUrlOnlyLower = chrome.i18n.getMessage('blockurlonlylower');

chrome.storage.sync.get('rules', ({ rules }) => {
  if (rules) {
    rules.forEach(rule => {
      createRuleInputs(rule.blockURL, rule.redirectURL);
    });
  }
});

function createRuleInputs(blockURLValue = '', redirectURLValue = '') {
  
  const ruleDiv = document.createElement('div');
  ruleDiv.className = 'rule';
  
  const blockURL = document.createElement('input');
  blockURL.type = 'text';
  blockURL.placeholder = chrome.i18n.getMessage('blockurl');
  blockURL.value = blockURLValue;
  
  const redirectURL = document.createElement('input');
  redirectURL.type = 'text';
  redirectURL.placeholder = chrome.i18n.getMessage('redirecturl');
  redirectURL.value = redirectURLValue;
  
  const saveButton = document.createElement('button');
  saveButton.className = 'save-btn';
  saveButton.textContent = chrome.i18n.getMessage('savebtn');
  
  const deleteButton = document.createElement('button');
  deleteButton.className = 'delete-btn';
  deleteButton.textContent = chrome.i18n.getMessage('deletebtn');
  
  saveButton.addEventListener('click', () => {
    if (blockURL.value === '') return;
    if (!isValidAscii(blockURL.value)) {
      customAlert(blockUrlOnlyAscii);
      return;
    }
    if (!isOnlyLowerCase(blockURL.value)) {
      customAlert(blockUrlOnlyLower);
      return;
    }
    
    chrome.storage.sync.get('rules', ({ rules }) => {
      rules = rules || [];
      
      const ruleExists = rules.some(rule =>
        rule.blockURL === blockURL.value && rule.redirectURL === redirectURL.value
      );
      
      if (ruleExists) {
        const alertMessage = chrome.i18n.getMessage('alertruleexist');
        customAlert(alertMessage);
        blockURL.value = '';
        redirectURL.value = '';
      } else {
        if (redirectURL.value) {
          if (!isValidURL(redirectURL.value)) {
            customAlert(wrongRedirectUrl);
            return;
          }
        }
        
        rules.push({ blockURL: blockURL.value.trim(), redirectURL: redirectURL.value.trim() });
        chrome.storage.sync.set({ rules }, () => {
          createRuleInputs();
          const outputText = chrome.i18n.getMessage('savedrules', ' ' + rules.length + ' ');
          statusOutput.value = outputText;
          blockURL.readOnly = true;
          redirectURL.readOnly = true;
          saveButton.remove();
          customAlert('+ 1');
        });
      }
    });
  });
  
  deleteButton.addEventListener('click', () => {
    chrome.storage.sync.get('rules', ({ rules }) => {
      rules = rules || [];
      rules = rules.filter((rule) => rule.blockURL !== blockURL.value.trim() || rule.redirectURL !== redirectURL.value.trim());
      chrome.storage.sync.set({ rules });
      
      const outputText = chrome.i18n.getMessage('savedrules', ' ' + rules.length + ' ');
      statusOutput.value = outputText;
    });
    if (blockURL.value) {
      customAlert('- 1');
    }
    ruleDiv.remove();
  });
  
  setTimeout(function() {
    ruleDiv.appendChild(blockURL);
    ruleDiv.appendChild(redirectURL);
    if (!blockURLValue) {
      ruleDiv.appendChild(saveButton);
    } else {
      blockURL.readOnly = true;
      redirectURL.readOnly = true;
    }
    ruleDiv.appendChild(deleteButton);
    
    rulesContainer.insertAdjacentElement('afterbegin', ruleDiv);
  }, 0);
}

addRuleButton.addEventListener('click', () => {
  createRuleInputs();
});