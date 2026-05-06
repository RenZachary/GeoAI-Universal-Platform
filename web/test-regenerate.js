// Test script to check the regenerate button functionality
console.log('Testing regenerate button functionality...');

// This would be run in browser console to debug the issue
// Check if MessageBubble component is properly handling the regenerate click
const checkRegenerateButton = () => {
  // Find all regenerate buttons
  const regenerateButtons = document.querySelectorAll('.message-actions .el-button');
  
  console.log(`Found ${regenerateButtons.length} message action buttons`);
  
  // Check if any have regenerate text
  let foundRegenerate = false;
  regenerateButtons.forEach((btn, index) => {
    const text = btn.textContent?.trim();
    if (text && text.includes('重新生成') || text && text.includes('regenerate')) {
      console.log(`Found regenerate button at index ${index}:`, btn);
      foundRegenerate = true;
      
      // Check if it has a click handler
      btn.click();
      console.log('Clicked regenerate button');
    }
  });
  
  if (!foundRegenerate) {
    console.log('No regenerate buttons found');
  }
};

// Run the test
checkRegenerateButton();