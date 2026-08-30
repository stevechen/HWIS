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
					The HWIS CAS Point System supports teachers in encouraging students' positive behavior
					by awarding evaluation points, and provides administrators with oversight and reporting.
					This policy explains the personal data the system handles and how we protect it.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">2. Data we collect</h2>
				<ul class="list-disc space-y-1 pl-5">
					<li>Staff sign in with their school Google account. We receive your name and email for authentication.</li>
					<li>We store your name, role, and account status in order to control access to the system.</li>
					<li>We store evaluation records (points awarded to students under categories), including student names and IDs.</li>
					<li>We record house competition events and point totals.</li>
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
				<h2 class="mb-1 text-base font-semibold text-gray-800">4. How we store and protect the data</h2>
				<p>
					Data is stored in a secured cloud database. Access is limited to authenticated staff,
					with role-based permissions enforced at the server. Backups are taken for disaster
					recovery and, where required by accreditation, records may be retained for up to five years.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">5. Data retention</h2>
				<p>
					Academic and behavioral records are kept for the period required by the school's
					accreditation obligations (up to five years). User accounts that have been disabled are
					retained accordingly, after which they may be permanently removed.
				</p>
			</section>

			<section>
				<h2 class="mb-1 text-base font-semibold text-gray-800">6. Your rights and contact</h2>
				<p>
					For questions about this policy, to request access to, correction of, or deletion of your
					personal data, please contact the school administration office.
				</p>
			</section>
		</div>
	</div>
</div>
