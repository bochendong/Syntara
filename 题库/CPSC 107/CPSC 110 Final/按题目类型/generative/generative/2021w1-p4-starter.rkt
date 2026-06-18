;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname 2021w1-p4-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w1-f/f-p4)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;do not edit or delete this tag
(@problem 2) ;do not edit or delete this tag
(@problem 3) ;do not edit or delete this tag
(@problem 4) ;do not edit or delete this tag

#|
This file is based on the material in f-p3-starter.rkt.  To make it easier,
everything you need to solve this problem is in this file. That does mean
there is some repeated material though.


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

(@template-origin encapsulated Room (listof Stairs) Stairs genrec)

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
In this starter file you must write a complete design for the
find-increasing-path-sr function.

This function must use structural recursion. It consumes a from room name and
a to room name. It searches the graph for a path starting at the from room,
going to the to room, and where each Stairs taken must have at least one more
steps than the previous stairs.  If there is no path, it produces false. 
Otherwise, for the first such path it finds, it produces a list of the
Stairs labels on the path starting with the first Stairs and ending with the
last Stairs.

You must provide a complete HtDF function design below. For maximum credit
your function should run properly and pass all submitted and additional
tests.
|#

(@htdf find-increasing-path-sr)
(@signature String String -> (listof String) or false)

(check-expect (find-increasing-path-sr "Z" "G") false)
(check-expect (find-increasing-path-sr "E" "B") false)

(check-expect (find-increasing-path-sr "A" "A") empty)
(check-expect (find-increasing-path-sr "D" "D") empty)
(check-expect (find-increasing-path-sr "B" "B") empty)

(check-expect (find-increasing-path-sr "A" "F") (list "a-4-b" "b-5-f"))
(check-expect (find-increasing-path-sr "A" "Z") (list "a-4-b" "b-5-f" "f-6-z"))
(check-expect (find-increasing-path-sr "A" "G") (list "a-4-d" "d-6-g"))

(check-expect (find-increasing-path-sr "A" "E") (list "a-4-b" "b-5-e"))
(check-expect (find-increasing-path-sr "D" "Z") (list "d-4-f" "f-6-z"))
(check-expect (find-increasing-path-sr "E" "Z") (list "e-3-z"))

(@template-origin
 encapsulated
 genrec
 Room (listof Stairs) Stairs
 try-catch
 accumulator)

; (define (find-increasing-path-sr from to) false) ;stub


(define (find-increasing-path-sr from to)

  (local [(define (fn-for-room rm visited)
            (cond
              [(string=? (room-name rm) to)
               (reverse (map stairs-label visited))]
              [else
               (fn-for-los (room-los rm) visited)]))

          (define (fn-for-los los visited)
            (cond [(empty? los) false]
                  [else
                   (local [(define try (fn-for-stairs (first los) visited))]
                     (if (not (false? try))
                         try
                         (fn-for-los (rest los) visited)))]))

          (define (fn-for-stairs strs visited)
            (cond [(member? strs visited) false]
                  [(and (not (empty? visited))
                        (<= (stairs-number strs)
                            (stairs-number (first visited))))
                  false]
                  [else
                   (fn-for-room (get-room (stairs-to-room-name strs))
                                (cons strs visited))]))]

    (fn-for-room (get-room from) empty)))



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
