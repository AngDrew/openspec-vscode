## ADDED Requirements

### Requirement: Streaming messages show typing indicator
The system SHALL display a typing indicator while waiting for AI responses.

#### Scenario: Typing indicator during response generation
- **WHEN** the user sends a message
- **THEN** a typing indicator SHALL appear
- **AND** it SHALL remain until the first response chunk arrives

### Requirement: Message content streams incrementally
AI responses SHALL appear incrementally as chunks arrive from the server.

#### Scenario: Response streams word by word
- **WHEN** the AI generates a response
- **THEN** text SHALL appear incrementally
- **AND** markdown SHALL be parsed as it arrives

### Requirement: Streaming supports cancellation
The user SHALL be able to cancel an ongoing streaming response.

#### Scenario: Cancel streaming response
- **WHEN** the user clicks the cancel button during streaming
- **THEN** the system SHALL stop receiving new chunks
- **AND** display the partial response received so far
