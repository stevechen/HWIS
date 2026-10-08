<script lang="ts">
	import logo from '$lib/assets/logo.svg';
</script>

<svelte:head>
	<title>HWIS CAS System — Privacy Policy</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-gray-50">
	<div class="mx-auto w-full max-w-3xl flex-1 bg-white px-6 py-10 shadow-md sm:px-10">
		<img src={logo} alt="HWIS Logo" class="mb-4 size-16" />
		<h1 class="mb-1 text-2xl font-bold text-gray-800">HWIS CAS Point System — Privacy Policy</h1>
		<p class="text-sm text-gray-500">Last updated: 2026</p>

		<div class="mt-6 space-y-6 text-sm leading-relaxed text-gray-700">
			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">1. Overview</h2>
				<p>
					The HWIS CAS Point System supports teachers in encouraging students' positive behavior by
					awarding evaluation points, and provides administrators with oversight and reporting. This
					policy explains the personal data the system handles and how we protect it.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">2. Data we collect</h2>
				<ul class="list-disc space-y-1 pl-5">
					<li>
						Staff sign in with their school Google account. We receive your name and email for
						authentication.
					</li>
					<li>
						We store your name, role, and account status in order to control access to the system.
					</li>
					<li>
						We store evaluation records (points awarded to students under categories), including
						student names and IDs.
					</li>
					<li>
						We store each student's English and Chinese name, student ID, class and grade, enrolment
						status, house, and any teacher note attached to the record.
					</li>
					<li>We record house competition events and point totals.</li>
					<li>
						We keep an audit log of administrative and teaching actions — who changed a record,
						when, and the before and after values — so that changes to student data can be traced.
					</li>
					<li>
						Students are identified from their school email address on each visit. No student
						password or student account profile is created.
					</li>
				</ul>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">3. How we use the data</h2>
				<p>
					Data is used solely to operate the point system: authenticating staff, managing users,
					awarding and reporting evaluation points, and running inter-house competitions. We do not
					sell or share personal data with third parties for marketing.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">4. Who can see what</h2>
				<p>
					Access depends on your role and is enforced on the server, not in the browser. Teachers
					see the students in the classes they teach. Administrators may see school-wide student and
					evaluation data in order to provide oversight. Students may see their own evaluations;
					teacher names are not shown to students on the student timeline. Public display boards
					show house and class totals, never individual student records.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">
					5. Data storage, backups, and protection
				</h2>
				<p>
					Data is stored in a secured cloud database. Access is limited to authenticated staff, with
					role-based permissions enforced at the server. The system is also backed up to a
					school-controlled Google Drive folder for disaster recovery; those backups are an off-site
					copy of the same records and are not shared beyond the school's own Drive account.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">6. Data retention</h2>
				<p>
					Academic and behavioral records are kept for the period required by the school's
					accreditation obligations (up to five years). User accounts that have been disabled are
					retained accordingly, after which they may be permanently removed. Daily automatic backups
					are retained for roughly one month; pre-restore safety snapshots for roughly three months;
					year-end migration snapshots are kept as the long-term records archive.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">7. Your rights and contact</h2>
				<p>
					You may request access to, correction of, or deletion of your personal data, subject to
					the school's record-keeping obligations, by contacting the school administration office.
					Requests are handled by the administration, and where records must be retained for
					accreditation, that retention takes precedence over deletion.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">8. Terms of use</h2>
				<p>
					Rules for using the system are set out in the
					<a href="/terms" class="underline">Terms of Service</a>.
				</p>
			</section>
		</div>
	</div>
</div>
