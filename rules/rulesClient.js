// chromium
export function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        
        if (lastError) {
          reject(
            new Error(
              lastError.message || 'Runtime messaging failed'
            )
          );
          return;
        }
        
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function createClientError(errorData = {}) {
  const error = new Error(errorData.message || errorData.code || 'Rules operation failed');
  error.code = errorData.code || 'rules_operation_failed';
  error.validationErrors = Array.isArray(errorData.validationErrors) ? errorData.validationErrors : [];
  return error;
}

async function sendRulesIntent(type, payload = {}) {
  const response = await sendRuntimeMessage({ type, payload });

  if (!response?.success) {
    throw createClientError(response?.error);
  }

  return response;
}

export class RulesClient {
  addRule(payload) {
    return sendRulesIntent('rules:add', payload);
  }

  updateRule(payload) {
    return sendRulesIntent('rules:update', payload);
  }

  deleteRule(ruleId) {
    return sendRulesIntent('rules:delete', { ruleId });
  }

  toggleRule(ruleId) {
    return sendRulesIntent('rules:toggle', { ruleId });
  }

  replaceAll(rules, settings = null) {
    return sendRulesIntent('rules:replaceAll', { rules, settings });
  }

  clearRules() {
    return sendRulesIntent('rules:clear');
  }

  toggleCategory(category) {
    return sendRulesIntent('rules:toggleCategory', { category });
  }
}
