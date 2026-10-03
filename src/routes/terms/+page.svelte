<script lang="ts">
	import logo from '$lib/assets/logo.svg';
</script>

<svelte:head>
	<title>HWIS CAS System — Terms of Service</title>
	<meta
		name="description"
		content="Terms governing use of the HWIS CAS Point System by staff and students."
	/>
</svelte:head>

<div class="flex min-h-screen flex-col bg-gray-50">
	<div class="mx-auto w-full max-w-3xl flex-1 bg-white px-6 py-10 shadow-md sm:px-10">
		<img src={logo} alt="HWIS Logo" class="mb-4 size-16" />
		<h1 class="mb-1 text-2xl font-bold text-gray-800">HWIS CAS Point System — Terms of Service</h1>
		<p class="text-sm text-gray-500">Last updated: 2026</p>

		<div class="mt-6 space-y-6 text-sm leading-relaxed text-gray-700">
			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">1. Agreement</h2>
				<p>
					By signing in to the HWIS CAS Point System ("the System"), you agree to these terms. The
					System is operated by the school for educational purposes, and use is limited to
					authorised members of the school community. If you do not agree, please do not use the
					System, and contact the school administration office.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">2. Who may use the System</h2>
				<p>
					Access is restricted to staff and students of the school, and is granted through a school
					Google account. Staff accounts are provisioned by the administration. Students are
					identified from their school email address, and no separate student account is created.
					Attempts to access the System by anyone else are recorded and may result in access being
					revoked.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">3. Acceptable use</h2>
				<p>When using the System you agree that you will:</p>
				<ul class="list-disc space-y-1 pl-5">
					<li>
						Record evaluations honestly, in good time, and only for students and situations you are
						responsible for;
					</li>
					<li>
						Not enter or alter records for students outside your assigned classes or for any
						improper purpose;
					</li>
					<li>
						Not attempt to access another teacher's records, export data, or use the System to
						gather information about individuals beyond your teaching responsibilities;
					</li>
					<li>
						Not share your credentials, and report a lost or compromised account to the
						administration promptly.
					</li>
				</ul>
				<p class="mt-2">
					The System records who made each change. Misuse may lead to removal of evaluation points,
					loss of access, and disciplinary action under the school's student and staff policies.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">4. How points work</h2>
				<p>
					Points are a recognition and feedback tool, not a grade and not a fixed scale of
					achievement. Points do not by themselves determine admission, progression, or academic
					standing. House totals are a light-hearted competition between houses and should not be
					read as a measure of any individual student's conduct or ability.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">5. Corrections</h2>
				<p>
					Evaluations are normally locked after the following Monday so that weekly reports stay
					consistent. If you believe an evaluation is mistaken, contact the teacher who recorded it
					or the administration office promptly. Do not edit a locked record yourself.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">6. Availability</h2>
				<p>
					The System is provided for school use and is not a critical service. We aim to keep it
					available during the school day but do not guarantee uninterrupted access. Data is backed
					up for recovery, and some records are retained for a period required by the school's
					accreditation obligations.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">7. Changes to these terms</h2>
				<p>
					These terms may be updated as the System changes. The "last updated" date above always
					reflects the current version, and continued use after an update constitutes acceptance.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">8. Privacy and contact</h2>
				<p>
					How the System handles personal data is described in the
					<a href="/privacy" class="underline">Privacy Policy</a>. For questions about these terms
					or about your personal data, please contact the school administration office.
				</p>
			</section>
		</div>
	</div>
</div>
