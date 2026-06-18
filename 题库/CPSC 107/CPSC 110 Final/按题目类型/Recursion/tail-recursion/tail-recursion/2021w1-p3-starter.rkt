;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w1-f/f-p3)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;do not edit or delete this tag
(@problem 2) ;do not edit or delete this tag
(@problem 3) ;do not edit or delete this tag

#|
The material in this file applies to THREE problems: 
  - # Problem # 3 in this f-p3-starter.rkt file
  - # Problem # 4 in the  f-p4-starter.rkt file
  - # Problem # 5 in the  f-p5-starter.rkt file

This problem is left over from Halloween. We hope it won't be too scary!

Every good haunted house has spooky magical stairs. In this haunted house the
stairs always go up - so if you go from room to room and end up back where you
started you will only have gone up! To be even more spooky different routes to
the same room might go up a different number of stairs. Whether this house is
haunted or just annoying is a good question!

Data definitions:
|#

(@htdd Room)
(@htdd Stairs)
(define-struct room (name los))
(define-struct stairs (label number to-room-name))
;;
;; Room is (make-room String (listof Stairs))
;; Stairs is (make-stairs String Natural String)
;;
;; interp.
;;  A Room has a name and a list of the Stairs leading AWAY from that room.
;;
;;  A (flight of) Stairs has a label, a number of steps, and the name of the
;;  room they lead to. The label of Stairs are always formed the same way and
;;  are intended to describe where they fit in the graph - a Stairs with 4 steps
;;  that leads from room "A" to room "C" will have label "a-4-c".
;;

#|
As defined above these types do not form a graph.  But we are giving you a
primitive function called get-room that is like the lookup-venue function
from lab 11.  get-room consumes a string and produces the Room with that
given name. get-room is defined at the end of all three starter files, but
you should not need to look at the definition. A diagram of the
haunted house that get-room provides is at:

- https://cs110.students.cs.ubc.ca/exams/2021w1-f/f-p345.pdf

The templates for Room, (listof Stairs) and Stairs, combined with get-room
produces a generative graph search.  Below is the combined template for
traversing the haunted house. But note that this template does not yet have the
trivial case test for genrec in it, nor does it have any mechanism for handling
cycles or joins.  For each function below you will have to decide where to put
that functionality.
|#

(@template-origin encapsulated Room (listof Stairs) Stairs)

(define (fn-for-haunted-house from)
  ;; trivial case:
  ;; reduction step:
  ;; proof of termination:
  (local [(define (fn-for-room rm)
            (... (room-name rm)
                 (fn-for-los (room-los rm))))

          (define (fn-for-los los)
            (cond [(empty? los) (...)]
                  [else
                   (... (fn-for-stairs (first los))
                        (fn-for-los (rest los)))]))

          (define (fn-for-stairs strs)
            (... (stairs-label strs)
                 (stairs-number strs)
                 (fn-for-room (get-room (stairs-to-room-name strs)))))]

    (fn-for-room (get-room from))))


#|
In these three starter files you are going to be considering 4 different
functions.

In THIS FILE YOU WILL ANSWER QUESTIONS ABOUT THE DESIGN OF ALL 4 FUNCTIONS.
In the f-p4-starter.rkt file you will DESIGN ONE OF THE FIRST 3 FUNCTIONS.
In the f-p5-starter.rkt file you will DESIGN THE FOURTH FUNCTION.

Below is a description of each function along with space to answer 6 or 7
questions about each function.  You MUST ANSWER all these questions for all
four functions in this file. The questions are:

- Does the function require a path accumulator?
- Does the function require a visited accumulator?
- Does the function require at least a worklist, but not any tandem
  worklists?
- Does the function require a worklist and at least one tandem worklist?
- Does the function require try-catch?
- Also, IF YOU ANSWER YES to tandem worklists, then you will need to
  name ALL your worklists and explain what information each will
  represent.

NOTE: BE SURE TO RUN THIS FILE OFTEN AS YOU WORK ON IT AND DEFINITELY
EACH TIME BEFORE YOU SUBMIT.  WE HAVE INCLUDED SPECIAL CHECK-EXPECTS AT
THE END THAT WILL TELL YOU IF YOUR ANSWERS TO THE YES/NO QUESTIONS ARE
PROPERLY FORMATTED.
|#



;; ---- find-path-sr ----
#|
This function must use structural recursion. It consumes a from room name and
a to room name. It searches the graph for a path starting at the from room
going to the to room.  It there is no path it produces false.  Otherwise, for
the first such path it finds, it produces a list of the stairs labels on the
path starting with the first stairs and ending with the last stairs.
|#

(define fpsr-path-accumulator?    "???")    ;replace "???" with "yes" or "no"
(define fpsr-visited-accumulator? "???")    ;replace "???" with "yes" or "no"
(define fpsr-worklist?            "???")    ;replace "???" with "yes" or "no"
(define fpsr-tandem-worklists?    "???")    ;replace "???" with "yes" or "no"
(define fpsr-try-catch?           "???")    ;replace "???" with "yes" or "no"

#|
IF YOU ANSWERED YES TO FPSR-TANDEM-WORKLISTS then please name all the worklists
you need and explain what information each one will represent:




|#




;; ---- find-increasing-path-sr ----
#|
This function must use structural recursion. It consumes a from room name and
a to room name. It searches the graph for a path starting at the from room,
going to the to room, and where each stairs taken must have at least one more
steps than the previous stairs.  It there is no path it produces false. 
Otherwise, for the first such path it finds, it produces a list of the
stairs labels on the path starting with the first stairs and ending with the
last stairs.
|#
(define fipsr-path-accumulator?    "???")    ;replace "???" with "yes" or "no"
(define fipsr-visited-accumulator? "???")    ;replace "???" with "yes" or "no"
(define fipsr-worklist?            "???")    ;replace "???" with "yes" or "no"
(define fipsr-tandem-worklists?    "???")    ;replace "???" with "yes" or "no"
(define fipsr-try-catch?           "???")    ;replace "???" with "yes" or "no"

#|
IF YOU ANSWERED YES TO FIPSR-TANDEM-WORKLISTS then please name all the worklists
you need and explain what information each one will represent:




|#




;; ---- find-easiest-path-sr ----
#|

This function must use structural recursion. It consumes a from room name and a
to room name. It searches the graph for a path starting at the from room, going
to the to room.  It there is no such path it produces false.  Otherwise, it
finds the path with the fewest number of steps, and for that path it produces
the stairs labels on the path starting with the first stairs and ending with the
last stairs.

|#
(define fepsr-path-accumulator?    "???")    ;replace "???" with "yes" or "no"
(define fepsr-visited-accumulator? "???")    ;replace "???" with "yes" or "no"
(define fepsr-worklist?            "???")    ;replace "???" with "yes" or "no"
(define fepsr-tandem-worklists?    "???")    ;replace "???" with "yes" or "no"
(define fepsr-try-catch?           "???")    ;replace "???" with "yes" or "no"

#|
IF YOU ANSWERED YES TO FEPSR-TANDEM-WORKLISTS then please name all the worklists
you need and explain what information each one will represent:




|#




;; ---- find-easiest-increasing-path-tr ----
#|
This function must use tail recursion. It consumes a from room name and
a to room name. It searches the graph for a path starting at the from room,
going to the to room, and where each stairs taken must have at least one more
steps than the previous stairs.  It there is no such path it produces false. 
Otherwise, it finds the path with the fewest number of steps, and for that 
path it produces the stairs labels on the path starting with the first stairs
and ending with the last stairs.
|#
(define feiptr-path-accumulator?    "???")    ;replace "???" with "yes" or "no"
(define feiptr-visited-accumulator? "???")    ;replace "???" with "yes" or "no"
(define feiptr-worklist?            "???")    ;replace "???" with "yes" or "no"
(define feiptr-tandem-worklists?    "???")    ;replace "???" with "yes" or "no"
(define feiptr-try-catch?           "???")    ;replace "???" with "yes" or "no"

#|
IF YOU ANSWERED YES TO FEIPTR-TANDEM-WORKLISTS then please name all the
worklists you need and explain what information each one will represent:




|#







;; ****
;;
;; Below here is the definition of get-room.  You should treat it as a primitive
;; function described above, and should not look at its definition.
;;

(define HOUSE '(("A" ((4 "B") (2 "C") (4 "D")))
                ("B" ((5 "E") (5 "F")))
                ("C" ((3 "F")))
                ("D" ((4 "F") (6 "G")))
                ("E" ((6 "A") (3 "Z")))
                ("F" ((6 "Z")))
                ("G" ((7 "Z")))
                ("Z" ())))

(define (get-room name)
  (local [(define entry (assoc name HOUSE))]
    (if (false? entry)
        (error "No room with name " name)
        (make-room (first entry)
                   (map (lambda (args)
                          (make-stairs
                           (string-downcase
                            (string-append (first entry)
                                           "-"
                                           (number->string (first args))
                                           "-"
                                           (second args)))
                           (first args)
                           (second args)))
                        (second entry))))))


;; Below here is testing infrastructure that you must not change.
(define (yes-or-no-answer? x)
  (or (equal? x "yes")
      (equal? x "no")))

(define (worklist-and-tandem-worklists-are-mutually-exclusive? tandem-worklists)
  (lambda (x)
    (cond [(string=? x "yes")
           (not (string=? tandem-worklists "yes"))]
          [else true])))

(check-satisfied fpsr-path-accumulator?    yes-or-no-answer?)
(check-satisfied fpsr-visited-accumulator? yes-or-no-answer?)
(check-satisfied fpsr-worklist?            yes-or-no-answer?)
(check-satisfied fpsr-tandem-worklists?    yes-or-no-answer?)
(check-satisfied fpsr-try-catch?           yes-or-no-answer?)

(check-satisfied fpsr-worklist?
                 (worklist-and-tandem-worklists-are-mutually-exclusive?
                  fpsr-tandem-worklists?))

(check-satisfied fipsr-path-accumulator?    yes-or-no-answer?)
(check-satisfied fipsr-visited-accumulator? yes-or-no-answer?)
(check-satisfied fipsr-worklist?            yes-or-no-answer?)
(check-satisfied fipsr-tandem-worklists?    yes-or-no-answer?)
(check-satisfied fipsr-try-catch?           yes-or-no-answer?)

(check-satisfied fipsr-worklist?
                 (worklist-and-tandem-worklists-are-mutually-exclusive?
                  fipsr-tandem-worklists?))

(check-satisfied fepsr-path-accumulator?    yes-or-no-answer?)
(check-satisfied fepsr-visited-accumulator? yes-or-no-answer?)
(check-satisfied fepsr-worklist?            yes-or-no-answer?)
(check-satisfied fepsr-tandem-worklists?    yes-or-no-answer?)
(check-satisfied fepsr-try-catch?           yes-or-no-answer?)

(check-satisfied fepsr-worklist?
                 (worklist-and-tandem-worklists-are-mutually-exclusive?
                  fepsr-tandem-worklists?))

(check-satisfied feiptr-path-accumulator?    yes-or-no-answer?)
(check-satisfied feiptr-visited-accumulator? yes-or-no-answer?)
(check-satisfied feiptr-worklist?            yes-or-no-answer?)
(check-satisfied feiptr-tandem-worklists?    yes-or-no-answer?)
(check-satisfied feiptr-try-catch?           yes-or-no-answer?)

(check-satisfied feiptr-worklist?
                 (worklist-and-tandem-worklists-are-mutually-exclusive?
                  feiptr-tandem-worklists?))
