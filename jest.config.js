module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/src/postgres/',
  ],
  modulePathIgnorePatterns: ['<rootDir>/dist'],
}
