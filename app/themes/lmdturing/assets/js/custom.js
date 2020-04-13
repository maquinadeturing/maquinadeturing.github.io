jQuery(document).ready(function ($) {
	$( "form.search-form" ).submit(function( event ) {
		q = $( "form.search-form input.search-field" );
		s = $( "form.search-form input.search-value" );
		s.val( q.val() + " site:lamaquinadeturing.su" );
	});
});
