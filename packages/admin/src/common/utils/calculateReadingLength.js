export default function (htmlContent) {
  // Create a temporary DOM element to parse HTML content
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  // Extract text content from HTML
  const textContent = tempDiv.textContent || tempDiv.innerText || '';

  // Calculate word count
  const words = textContent.trim().split(/\s+/).length;

  // Average reading speed (words per minute)
  const wordsPerMinute = 200; // You can adjust this value as needed

  // Calculate reading length in minutes
  const readingLength = Math.ceil(words / wordsPerMinute);

  if (readingLength === 0) {
    return `Less than a minute`;
  } else if (readingLength === 1) {
    return `${readingLength} minute`;
  } else {
    return `${readingLength} minutes`;
  }
}
