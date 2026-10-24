## ADDED Requirements

### Requirement: Note storage capacity and privacy

The note storage system SHALL store lesson notes up to 10,000 characters while preserving assigned teacher privacy and empty note cleanup.

#### Scenario: Note character limit validation

- **WHEN** a teacher writes a note up to 10,000 characters
- **THEN** the mutation succeeds and saves the full content

#### Scenario: Note exceeds 10,000 characters

- **WHEN** a teacher submits text exceeding 10,000 characters
- **THEN** the mutation rejects the write with an error message stating the limit

#### Scenario: Clearing or blank text deletes row

- **WHEN** a teacher saves blank or whitespace-only text
- **THEN** any existing record for that class and date is deleted from the database

#### Scenario: Strict assigned teacher access control

- **WHEN** a user who is not the assigned teacher for the class attempts to read or write notes
- **THEN** the system refuses the request with a forbidden error
