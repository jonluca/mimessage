const REPLACEMENT_CHAR = '_';
const DISALLOWED_CHARS = ['/', '\\', ':'];

function sanitizeFilename(filename: string): string {
  return filename.split('').map(letter => DISALLOWED_CHARS.includes(letter) ? REPLACEMENT_CHAR : letter).join('');
}

// Tests
function testSanitizeFilename() {
  const cases = [
    { cont: "a/b\\c:d", expected: "a_b_c_d" },
    { cont: "a_b_c_d", expected: "a_b_c_d" },
    { cont: "ab/cd", expected: "ab_cd" },
  ];

  cases.forEach(({cont, expected}) => {
    const sanitized = sanitizeFilename(cont);
    if(sanitized !== expected){
      throw new Error(`Failed for input ${cont}. Expected ${expected}, got ${sanitized}`);
    }
  })
}

testSanitizeFilename();