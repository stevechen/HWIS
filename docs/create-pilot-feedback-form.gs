/**
 * Creates the "Pilot Feedback" Google Form for the HWIS CAS dry run (per map #62).
 * Run `createPilotFeedbackForm()` once in script.google.com.
 */
function createPilotFeedbackForm() {
	const form = FormApp.create('Pilot Feedback')
		.setDescription(
			'HWIS CAS dry run feedback. Anonymous — no name/email is captured. ' +
				'Log issues AND smooth finishes so we know what worked. ' +
				'🔴 Blocker = tell an admin immediately.'
		)
		.setCollectEmail(false)
		.setAllowResponseEdits(false)
		.setLimitOneResponsePerUser(false);

	// 1. Who's reporting?
	const role = form.addMultipleChoiceItem();
	role
		.setTitle("Who's reporting?")
		.setChoiceValues(['Teacher', 'Admin', 'Student'])
		.setRequired(true);

	// 2. Where were you?
	form
		.addTextItem()
		.setTitle('Where were you? (e.g. Login page, Evaluations timeline, Add student modal)')
		.setRequired(true);

	// 3. What were you trying to do?
	form.addTextItem().setTitle('What were you trying to do?').setRequired(true);

	// 4. What actually happened?
	form.addTextItem().setTitle('What actually happened?').setRequired(true);

	// 5. What did you expect to happen?
	form.addTextItem().setTitle('What did you expect to happen?').setRequired(true);

	// 6. How did it go?
	const outcome = form.addMultipleChoiceItem();
	outcome
		.setTitle('How did it go?')
		.setChoices([
			outcome.createChoice('✅ Smooth — finished with no problem'),
			outcome.createChoice('🟢 Suggestion / Nice-to-have'),
			outcome.createChoice('🟡 Bug — workaround exists (annoying but I finished)'),
			outcome.createChoice("🔴 Blocker — I couldn't complete the task")
		])
		.setRequired(true);

	// Log responses to a Google Sheet (Timestamp is added automatically as col A).
	const sheet = SpreadsheetApp.create('Pilot Feedback (Log)');
	form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

	Logger.log('Form created: %s', form.getPublishedUrl());
	Logger.log('Log Sheet: %s', sheet.getUrl());
}
