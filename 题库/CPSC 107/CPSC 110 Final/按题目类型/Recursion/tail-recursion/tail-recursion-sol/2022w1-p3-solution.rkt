;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.

(require spd/tags)

(@assignment exams/2022w1-f/f-p3);Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line


(define-struct node (name size nexts))
;;
;; Node is (make-node String Natural (listof String))
;; A node in a graph that has:
;;  - the name of the node (these are unique in any given graph)
;;  - the size of the node (these may be duplicated in a given graph)
;;  - a list of the names of the node this node has an arrow pointing TO
;;
;; The lookup-node function finds the node with the given name.
;;
;; For example
;; (lookup-node "A") produces (make-node "A" 10 (list "B" "C" "D"))
;;
;; The diagram in f-p3-figure.pdf represents the following graph.  USE THE
;; CONSTANT BELOW TO DETERMINE THE ORDER OF THE ARROWS LEAVING EACH NODE.
;;
(define GRAPH
  (list (make-node "A" 10 (list "B" "C" "D"))
        (make-node "B" 20 (list "E"))
        (make-node "C" 30 (list "E" "F" "A"))
        (make-node "D" 20 (list ))
        (make-node "E" 10 (list "H" "I"))
        (make-node "F" 20 (list "G" "D" "A"))
        (make-node "G" 10 (list "B"))
        (make-node "H" 10 (list ))
        (make-node "I" 10 (list ))))

(define A (list-ref GRAPH 0))
(define B (list-ref GRAPH 1))
(define C (list-ref GRAPH 2))
(define D (list-ref GRAPH 3))
(define E (list-ref GRAPH 4))
(define F (list-ref GRAPH 5))
(define G (list-ref GRAPH 6))
(define H (list-ref GRAPH 7))
(define I (list-ref GRAPH 8))

(define (fn-for-graph start-node-name)
  (local [(define (fn-for-node n)
            (... (node-name n)
                 (node-size n)
                 (fn-for-los (node-nexts n))))

          (define (fn-for-los los)
            (cond [(empty? los) (...)]
                  [else
                   (... (fn-for-string (first los))
                        (fn-for-los (rest los)))]))

          (define (fn-for-string s)
            (... (fn-for-node (lookup-node s))))]

    (fn-for-string start-node-name)))



;; each visited-at answer must be a list of node names "A", "B" etc.
(define visited-at-A  (list))
(define visited-at-E1 (list "A" "B"))
(define visited-at-E2 (list "A" "B" "E" "H" "I" "C"))
(define visited-at-G  (list "A" "B" "E" "H" "I" "C" "F"))

;; each node-wl-at answer must be a list of nodes names "A", "B" etc.
(define node-wl-at-A  (list))
(define node-wl-at-E1 (list "C" "D"))
(define node-wl-at-E2 (list "F" "A" "D"))
(define node-wl-at-G  (list "D" "A" "A" "D"))

;; each path-wl-at answer must be a list of lists of node names "A", "B" etc.
(define path-wl-at-A  (list))
(define path-wl-at-E1 (list (list "A")
                            (list "A")))
(define path-wl-at-E2 (list (list "A" "C")
                            (list "A" "C")
                            (list "A")))
(define path-wl-at-G  (list (list "A" "C" "F")
                            (list "A" "C" "F")
                            (list "A" "C")
                            (list "A")))



(define part-2a-rsf-accumulator?     "yes") ;"yes" or "no"
(define part-2a-path-accumulator?    "no")  ;"yes" or "no"
(define part-2a-visited-accumulator? "yes") ;"yes" or "no"
(define part-2a-worklists?           1)     ;a natural number, 0, 1, 2...


(define part-2b-rsf-accumulator?     "yes")
(define part-2b-path-accumulator?    "yes")
(define part-2b-visited-accumulator? "no")
(define part-2b-worklists?           2)


(define part-2c-rsf-accumulator?     "no")
(define part-2c-path-accumulator?    "yes")
(define part-2c-visited-accumulator? "no")
(define part-2c-worklists?           0)

(define part-2d-rsf-accumulator?     "no")
(define part-2d-path-accumulator?    "yes")
(define part-2d-visited-accumulator? "no")
(define part-2d-worklists?           2)



;; ==========================================================
;; >>>>>>>>>> YOU DO NOT NEED TO READ BELOW HERE <<<<<<<<<<<<
;; ==========================================================
;;
;; The code below here ensures that running the file will verify that your
;; answers are well-formed.  You do not need to and SHOULD NOT READ this code.
;; You MUST NOT EDIT this code.
;;

(define (lo p)
  (lambda (x) (and (list? x) (andmap p x))))


;; these are named to work well with check-satisfied failures

(define (is-natural x)
  (and (integer? x) (>= x 0)))

(define (is-string-yes-or-no x)
  (or (equal? x "yes")
      (equal? x "no")))

(define (is-list-of-string l)         ((lo string?) l))
(define (is-list-of-node l)           ((lo node?) l))
(define (is-list-of-list-of-string l) ((lo (lo string?)) l))


; PART 1
(check-satisfied visited-at-A  is-list-of-string)
(check-satisfied visited-at-E1 is-list-of-string)
(check-satisfied visited-at-E2 is-list-of-string)
(check-satisfied visited-at-G  is-list-of-string)

(check-satisfied node-wl-at-A  is-list-of-node)
(check-satisfied node-wl-at-E1 is-list-of-node)
(check-satisfied node-wl-at-E2 is-list-of-node)
(check-satisfied node-wl-at-G  is-list-of-node)

(check-satisfied path-wl-at-A  is-list-of-list-of-string)
(check-satisfied path-wl-at-E1 is-list-of-list-of-string)
(check-satisfied path-wl-at-E2 is-list-of-list-of-string)
(check-satisfied path-wl-at-G  is-list-of-list-of-string)

; PART 2
(check-satisfied part-2a-rsf-accumulator?     is-string-yes-or-no)
(check-satisfied part-2a-path-accumulator?    is-string-yes-or-no)
(check-satisfied part-2a-visited-accumulator? is-string-yes-or-no)
(check-satisfied part-2a-worklists?           is-natural)

(check-satisfied part-2b-rsf-accumulator?     is-string-yes-or-no)
(check-satisfied part-2b-path-accumulator?    is-string-yes-or-no)
(check-satisfied part-2b-visited-accumulator? is-string-yes-or-no)
(check-satisfied part-2b-worklists?           is-natural)

(check-satisfied part-2c-rsf-accumulator?     is-string-yes-or-no)
(check-satisfied part-2c-path-accumulator?    is-string-yes-or-no)
(check-satisfied part-2c-visited-accumulator? is-string-yes-or-no)
(check-satisfied part-2c-worklists?           is-natural)


(check-satisfied part-2d-rsf-accumulator?     is-string-yes-or-no)
(check-satisfied part-2d-path-accumulator?    is-string-yes-or-no)
(check-satisfied part-2d-visited-accumulator? is-string-yes-or-no)
(check-satisfied part-2d-worklists?           is-natural)


