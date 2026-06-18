;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-advanced-reader.ss" "lang")((modname f-p3-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2024w2-f/f-p3) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line


#|

 Design a function that consumes a Natural n, and (listof Natural) lon0, IN
 THAT ORDER. The function should discard ("skip") the first n elements of lon0,
 then keep ("pick") the next element, x.
   
   - If x is even, it continues by skipping another n times.
   
   - If x is odd, it continues by skipping x times.

For example:

  (n-skip-odd-skip 3 (list 0 1 2 4 4 5 6 5 8 9 10 11 12 7 8))

Produces

  (list 4 5 7)

Because:

  - skip 3 elements
  - pick 1 element  - 4   since x is even, skips n times
  - skip 3 elements
  - pick 1 element  - 5   since x is odd, skips x times
  - skip 5 elements  
  - pick 1 element  - 7   since x is odd, skips x times
  - skip 7 elements       one is skipped and then list runs out


Your function design must include an @htdf tag, @signature tag, purpose,
appropriate tests, a @template-origin tag, and a function definition. You must
follow all applicable design rules.

This problem will be autograded.  NOTE that all of the following are required.
Violating one or more will cause your solution to receive 0 marks.

 - You must not edit, comment out, or delete the existing @htdf tag.

 - You must define a function with the same name as in the existing @htdf tag.

 - Your design must include @signature, purpose, appropriate tests,
   @template-origin, and a working function definition.

 - You must follow all applicable design rules.

 - If you need any helper functions then you may define them using local.
   Or, if you choose to define a helper at top level, then as usual you must
   include all HtDF recipe elements (@htdf tag, @signature, purpose,
   check-expects, @template-origin, and function definition). Except for the
   purpose, do not comment out any of those elements.

 - Files must not have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.

|#

(@htdf n-skip-odd-skip)          

(define (n-skip-odd-skip n lon) empty)

