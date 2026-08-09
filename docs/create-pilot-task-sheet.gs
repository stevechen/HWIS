/**
 * Builds the CAS dry-run task Sheet (README + 3 session tabs) and generates a
 * pre-filled "Pilot Feedback" form link for every task row, so a reporter opens
 * the form with "Who's reporting?" + "What were you trying to do?" already filled.
 *
 * Run `buildPilotTaskSheet()` once in script.google.com.
 */
function buildPilotTaskSheet() {
	// --- The exact form this sheet's links point at. ---
	// HARDCODED to the form whose entry IDs were verified below. Do NOT use
	// findFormByTitle here — if script properties resolve a different
	// "Pilot Feedback" form, the entry IDs won't match and prefill breaks.
	const FORM_URL =
		'https://docs.google.com/forms/d/e/1FAIpQLSd9KPnE8FhFL_WdNKBSMOZC001gtFbSZdHJUIlIJPykLEpJSA/viewform';
	const baseUrl = FORM_URL;

	// --- Form entry field IDs (verified against the live published form). ---
	// NOTE: these come from the form page HTML, NOT from FormApp item.getId() —
	// Apps Script item IDs differ from the entry.<ID> used in prefill URLs.
	const ENTRY_ROLE = '1184697490'; // Who's reporting? (radio)
	const ENTRY_WHERE = '396950246'; // Where were you?
	const ENTRY_TRYING = '1325700128'; // What were you trying to do?
	const ENTRY_HAPPENED = '1767625219'; // What actually happened?
	const ENTRY_EXPECTED = '176499229'; // What did you expect?
	const ENTRY_OUTCOME = '1638229865'; // How did it go? (radio)

	// --- Task lists per session (matches docs/cas-dry-run-session-script.md) ---
	const sessions = [
		{
			name: 'Session 1 - Teacher Day',
			role: 'Teacher',
			tasks: [
				'Log in / log out',
				'Give an evaluation with a preset category + criteria',
				'Give an evaluation with a preset category + custom criteria',
				'Choose points with keyboard shortcuts',
				'Give an evaluation to multiple students by name',
				'Edit / delete a given evaluation',
				'Understand the weekly lock',
				"View a student's evaluation history (timeline view)",
				'Filter by student in the evaluations timeline',
				'Sort existing evaluations',
				'Show/hide comments'
			]
		},
		{
			name: 'Session 2 - Student Day',
			role: 'Student',
			tasks: [
				'Student logs in / out with @std.hwhs.tc.edu.tw',
				'Student views their own evaluations'
			]
		},
		{
			name: 'Session 3 - Admin block',
			role: 'Admin',
			tasks: [
				'Approve / revoke an account',
				'Add / edit a student',
				'Import students (CSV)',
				'Assign a teacher to a class',
				'Move a student to a different class',
				'Move a student / multiple students to a different house',
				'Disable a student',
				'Add a category + criteria; remove a category (in use + not in use)',
				'Download a weekly report',
				"View all teachers' evaluations",
				"Show/hide teachers' names in the evaluations timeline",
				'Show/hide Unenrolled students',
				'Sort the timeline',
				'Filter by teacher in the timeline view',
				'House display check'
			]
		}
	];

	// --- Build the spreadsheet ---
	const ss = SpreadsheetApp.create('CAS Dry Run - Tasks & Feedback');

	// README tab
	const readme = ss.insertSheet('README', 0);
	readme.getRange('A1').setValue('CAS Dry Run - Tasks & Feedback');
	readme.getRange('A1').setFontSize(16).setFontWeight('bold');
	readme
		.getRange('A3')
		.setValue(
			'App: https://hwis.vercel.app\nFeedback form: ' +
				FORM_URL +
				'\n\n' +
				'How to use:\n' +
				'1. Open your session tab.\n' +
				'2. Do each task. Tick Done? when finished.\n' +
				'3. Click the Log link on any row to open the feedback form with the task pre-filled — ' +
				'add what happened/expected + pick ✅/🟢/🟡/🔴.\n' +
				'4. 🔴 Blocker = tell an admin immediately.\n\n' +
				'Rough edges:\n' +
				'- /houses/display may error for non-admins (known).\n' +
				'- Weekly lock: evals editable only within the Mon-Sun week.\n' +
				'- Category delete blocked when referenced by evals (expected).\n\n' +
				'Triage: dev triages evenings. Blockers = same-day fix.'
		);
	readme.getDataRange().setFontSize(18);

	// Session tabs
	sessions.forEach(function (session) {
		const tab = ss.insertSheet(session.name);
		tab.getRange('A1').setValue('Task').setFontWeight('bold');
		tab.getRange('B1').setValue('Done?').setFontWeight('bold');
		tab.getRange('C1').setValue('Log').setFontWeight('bold');

		const rows = session.tasks.map(function (task) {
			return [task, 'FALSE'];
		});

		tab.getRange(2, 1, rows.length, 2).setValues(rows);

		// Done? column: pulldown menu with TRUE / FALSE
		const doneRange = tab.getRange(2, 2, rows.length, 1);
		doneRange.setDataValidation(
			SpreadsheetApp.newDataValidation()
				.requireValueInList(['TRUE', 'FALSE'], true)
				.setAllowInvalid(false)
				.build()
		);

		// Log links read the task live from column A, so editing a task in the
		// Sheet automatically changes what the form pre-fills.
		for (let i = 0; i < rows.length; i++) {
			const logUrl =
				baseUrl +
				'?entry.' +
				ENTRY_ROLE +
				'=' +
				encodeURIComponent(session.role) +
				'&entry.' +
				ENTRY_WHERE +
				'=' +
				encodeURIComponent(session.name) +
				'&entry.' +
				ENTRY_TRYING +
				'=" & ENCODEURL(A' +
				(2 + i) +
				')';
			tab.getRange(2 + i, 3).setFormula('=HYPERLINK("' + logUrl + ',"Log")');
		}

		tab.getRange('A1:C1').setBackground('#f3f4f6');
		tab.setColumnWidth(1, 380);
		tab.setColumnWidth(2, 60);
		tab.setColumnWidth(3, 80);

		// Default font size for the whole tab (headers + all rows)
		tab.getDataRange().setFontSize(18);
	});

	ss.deleteSheet(ss.getSheetByName('Sheet1'));

	Logger.log('Task Sheet created: %s', ss.getUrl());
	Logger.log('README tab: %s', ss.getUrl());
}
